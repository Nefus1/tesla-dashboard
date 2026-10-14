import crypto from "node:crypto";
import http from "node:http";
import { PUBLIC_DIR, splitList } from "./config.js";
import { COMMANDS, CommandError, capabilities, resolveServiceCall, validateValue } from "./commands.js";
import { HaClient } from "./ha-client.js";
import { summarizeHistory, toBoolSeries, toSeries } from "./history.js";
import { MockVehicle } from "./mock.js";
import { SseHub } from "./sse.js";
import { serveStatic } from "./static.js";
import { VehicleStore } from "./store.js";

const HISTORY_TTL_MS = 5 * 60_000;
const MAX_BODY = 16 * 1024;
const ACCESS_COOKIE = "td_access";
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export function createLogger(level = "info") {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const at = (name, fn) => (msg) => {
    if (LEVELS[name] >= threshold) fn(`${new Date().toISOString()} ${name.toUpperCase().padEnd(5)} ${msg}`);
  };
  return {
    debug: at("debug", console.log),
    info: at("info", console.log),
    warn: at("warn", console.warn),
    error: at("error", console.error)
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY) {
        reject(new HttpError(413, "Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new HttpError(400, "Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => {
    const i = part.indexOf("=");
    return i === -1 ? [part.trim(), ""] : [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }));
}

function securityHeaders(config) {
  let haOrigin = "";
  try { haOrigin = config.haUrl ? new URL(config.haUrl).origin : ""; } catch { /* validated elsewhere */ }
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'self'",
      `frame-ancestors 'self'${haOrigin ? ` ${haOrigin}` : ""}`
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  };
}

/**
 * Build the dashboard server. Nothing listens until `start()` is called.
 * @param {ReturnType<import("./config.js").buildConfig>} config
 * @param {{ logger?: any, persist?: boolean, haClient?: HaClient, mockTickMs?: number, mockLatencyMs?: number }} [options]
 */
export function createApp(config, options = {}) {
  const log = options.logger || createLogger(config.logLevel);
  // Demo mode keeps everything in memory so fake activity never mixes with the real car's.
  const store = new VehicleStore(config, log, { persist: options.persist ?? !config.mock });
  const sse = new SseHub();
  const caps = capabilities(config);
  const headers = securityHeaders(config);
  const startedAt = Date.now();
  let mock = null;
  let ha = null;
  let mockTimer = null;
  let historyCache = null;

  if (config.mock) {
    mock = new MockVehicle({ capacityKwh: config.vehicle.batteryCapacityKwh, latencyMs: options.mockLatencyMs ?? 350 });
    store.applyVehicle(mock.vehicle());
    store.setConnection({ connected: true, transport: "mock" });
    if (store.activity.length === 0) store.addActivity({ title: "Demo mode", detail: "Connect Home Assistant in .env", icon: "info" });
  } else {
    ha = options.haClient || new HaClient(config, log);
    ha.on("states", (states) => store.setStates(states));
    ha.on("entity", (entity) => store.updateEntity(entity));
    ha.on("status", (status) => {
      store.setConnection(status);
      sse.broadcast("status", status);
      if (status.connected) log.info(`Home Assistant connected via ${status.transport}`);
      else log.warn(`Home Assistant disconnected${status.error ? `: ${status.error}` : ""}`);
    });
  }

  store.on("state", (snapshot) => sse.broadcast("state", snapshot));
  store.on("activity", (item) => sse.broadcast("activity", item));

  // ─── Handlers ───────────────────────────────────────────────────────────────

  async function runCommand(body) {
    const command = String(body?.command || "");
    if (!COMMANDS[command]) throw new CommandError(command ? `Unsupported command: ${command}` : "Missing command");
    if (!caps[command]) throw new CommandError(`${COMMANDS[command].label} is not configured`, 409);

    const v = store.vehicle || {};
    const value = validateValue(command, body.value, {
      chargeLimitMin: v.chargeLimitMin,
      chargeLimitMax: v.chargeLimitMax,
      tempUnit: v.tempUnit,
      climateEntity: store.entityByKey("climate")
    });

    if (mock) {
      await mock.apply(command, value);
      store.applyVehicle(mock.vehicle());
    } else {
      const call = resolveServiceCall(command, value, config, (id) => store.entities.get(id));
      log.info(`Command ${command}=${JSON.stringify(value)} → ${call.domain}.${call.service}`);
      await ha.callService(call.domain, call.service, call.data);
      historyCache = null;
      if (ha.status.transport !== "websocket") setTimeout(() => ha.refresh().catch(() => {}), 1500).unref?.();
    }
    return { ok: true, command, value, state: store.snapshot() };
  }

  async function getHistory() {
    if (mock) return summarizeHistory(mock.series, config.vehicle);
    if (historyCache && Date.now() - historyCache.at < HISTORY_TTL_MS) return historyCache.data;

    const ids = { battery: config.entities.battery, charging: config.entities.charging, odometer: config.entities.odometer };
    const wanted = Object.values(ids).filter(Boolean);
    let lists = [];
    if (wanted.length) lists = await ha.history(wanted, new Date(Date.now() - 7 * 86_400_000));
    const byId = new Map((Array.isArray(lists) ? lists : []).filter((l) => l?.length).map((l) => [l[0].entity_id, l]));
    const data = summarizeHistory({
      battery: toSeries(byId.get(ids.battery)),
      charging: toBoolSeries(byId.get(ids.charging)),
      odometer: toSeries(byId.get(ids.odometer))
    }, config.vehicle);
    historyCache = { at: Date.now(), data };
    return data;
  }

  function publicConfig() {
    return {
      mode: config.mock ? "mock" : "home-assistant",
      capabilities: caps,
      vehicle: config.vehicle,
      entities: Object.fromEntries(Object.entries(config.entities).filter(([, id]) => id)),
      entitySearch: config.entitySearch
    };
  }

  // ─── Auth ───────────────────────────────────────────────────────────────────

  function authorize(req, res, url) {
    // Health stays open so container/uptime checks work; it exposes no vehicle data.
    if (!config.accessToken || url.pathname === "/api/health") return true;
    const queryToken = url.searchParams.get("token");
    if (queryToken && safeEqual(queryToken, config.accessToken) && req.method === "GET") {
      url.searchParams.delete("token");
      res.writeHead(303, {
        Location: `${url.pathname}${url.search}`,
        "Set-Cookie": `${ACCESS_COOKIE}=${encodeURIComponent(config.accessToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`
      });
      res.end();
      return false;
    }
    const cookie = parseCookies(req.headers.cookie)[ACCESS_COOKIE];
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1];
    if ((cookie && safeEqual(cookie, config.accessToken)) || (bearer && safeEqual(bearer, config.accessToken))) return true;

    if (url.pathname.startsWith("/api/")) sendJson(res, 401, { error: "unauthorized", message: "Missing or invalid dashboard access token" });
    else {
      res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Unauthorized. Open the dashboard once with ?token=<DASHBOARD_ACCESS_TOKEN>.");
    }
    return false;
  }

  function checkWrite(req) {
    const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (type !== "application/json") throw new HttpError(415, "Content-Type must be application/json");
    const origin = req.headers.origin;
    if (origin) {
      let host = "";
      try { host = new URL(origin).host; } catch { /* invalid origin */ }
      if (host !== req.headers.host) throw new HttpError(403, "Cross-origin requests are not allowed");
    }
  }

  // ─── Router ─────────────────────────────────────────────────────────────────

  const routes = {
    "GET /api/health": () => ({
      ok: true,
      mode: config.mock ? "mock" : "home-assistant",
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      homeAssistant: ha ? { ...ha.status } : null,
      clients: sse.size,
      loaded: store.loaded
    }),
    "GET /api/config": () => publicConfig(),
    "GET /api/state": () => store.snapshot(),
    "GET /api/activity": () => ({ items: store.activity }),
    "GET /api/history": () => getHistory(),
    "GET /api/entities": async (req, url) => {
      if (!ha) return { entities: [] };
      return { entities: await ha.findEntities(splitList(url.searchParams.get("q") || config.entitySearch.join(","))) };
    },
    "POST /api/command": async (req) => runCommand(await readJson(req)),
    "POST /api/refresh": async () => {
      if (ha) await ha.refresh();
      historyCache = null;
      return store.snapshot();
    },
    "POST /api/trip/reset": async () => {
      const baseline = store.resetTrip();
      if (baseline === null) throw new HttpError(409, "Odometer reading is unavailable");
      return store.snapshot();
    }
  };

  const server = http.createServer(async (req, res) => {
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    let url;
    try {
      url = new URL(req.url, "http://dashboard.local");
    } catch {
      return sendJson(res, 400, { error: "request_error", message: "Bad URL" });
    }

    try {
      if (!authorize(req, res, url)) return;

      if (url.pathname === "/api/events" && req.method === "GET") {
        return sse.connect(req, res, [["state", store.snapshot()], ["activity-log", store.activity]]);
      }

      const handler = routes[`${req.method} ${url.pathname}`];
      if (handler) {
        if (req.method === "POST") checkWrite(req);
        return sendJson(res, 200, await handler(req, url));
      }
      if (url.pathname.startsWith("/api/")) {
        const allowed = Object.keys(routes).filter((k) => k.endsWith(` ${url.pathname}`));
        if (allowed.length) throw new HttpError(405, "Method not allowed");
        throw new HttpError(404, "Unknown API endpoint");
      }
      return serveStatic(PUBLIC_DIR, req, res, url.pathname);
    } catch (error) {
      const status = Number(error.status) || 500;
      if (status >= 500) log.error(`${req.method} ${url.pathname}: ${error.message}`);
      else log.debug(`${req.method} ${url.pathname}: ${status} ${error.message}`);
      if (res.headersSent) return res.end();
      return sendJson(res, status, {
        error: status >= 500 ? "server_error" : "request_error",
        message: status === 500 ? "Unexpected server error" : error.message
      });
    }
  });

  return {
    server,
    store,
    sse,
    log,
    start(port = config.port, host = config.host) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          if (ha) ha.start();
          if (mock) {
            const tickMs = options.mockTickMs ?? 2000;
            let last = Date.now();
            mockTimer = setInterval(() => {
              const now = Date.now();
              if (mock.tick(now - last, now)) store.applyVehicle(mock.vehicle());
              last = now;
            }, tickMs);
          }
          resolve(server.address());
        });
      });
    },
    async stop() {
      clearInterval(mockTimer);
      if (ha) ha.stop();
      sse.close();
      store.flush();
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    }
  };
}
