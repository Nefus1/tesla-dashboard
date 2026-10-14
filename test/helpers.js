import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createApp, createLogger } from "../server/app.js";
import { buildConfig } from "../server/config.js";
import { HaClient } from "../server/ha-client.js";

export const silent = createLogger("silent");

/** Boot the dashboard on a random port. */
export async function startDashboard(env = {}, { haClient } = {}) {
  const config = buildConfig({
    LOG_LEVEL: "silent",
    DATA_DIR: path.join(os.tmpdir(), `td-test-${process.pid}-${Math.random().toString(36).slice(2)}`),
    POLL_INTERVAL_MS: "100",
    ...env
  });
  const client = haClient || (config.mock ? undefined : new HaClient(config, silent, { WebSocketImpl: null }));
  const app = createApp(config, { logger: silent, persist: false, mockLatencyMs: 0, mockTickMs: 60_000, haClient: client });
  const address = await app.start(0, "127.0.0.1");
  const base = `http://127.0.0.1:${address.port}`;
  return { app, base, config };
}

export async function json(base, pathname, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(base + pathname, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

/** Collect SSE events until `predicate(event)` is true or timeout. */
export function waitForEvent(url, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let buffer = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const event = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (!event || !data) continue;
          const parsed = { event, data: JSON.parse(data) };
          if (predicate(parsed)) {
            clearTimeout(timer);
            req.destroy();
            resolve(parsed);
            return;
          }
        }
      });
    });
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error("Timed out waiting for SSE event"));
    }, timeoutMs);
    req.on("error", () => {});
  });
}

/** Minimal fake Home Assistant REST API. */
export async function startFakeHa(initialStates) {
  const states = new Map(initialStates.map((s) => [s.entity_id, { attributes: {}, last_updated: new Date().toISOString(), ...s }]));
  const calls = [];
  const effects = {
    "lock.lock": (id) => set(id, "locked"),
    "lock.unlock": (id) => set(id, "unlocked"),
    "switch.turn_on": (id) => set(id, "on"),
    "switch.turn_off": (id) => set(id, "off"),
    "number.set_value": (id, data) => set(id, String(data.value))
  };
  function set(id, state) {
    const current = states.get(id);
    states.set(id, { ...current, state, last_updated: new Date().toISOString() });
  }

  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== "Bearer test-token") {
      res.writeHead(401);
      return res.end();
    }
    const url = new URL(req.url, "http://ha");
    if (req.method === "GET" && url.pathname === "/api/states") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify([...states.values()]));
    }
    const service = /^\/api\/services\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if (req.method === "POST" && service) {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        const data = JSON.parse(body || "{}");
        const name = `${service[1]}.${service[2]}`;
        calls.push({ service: name, data });
        effects[name]?.(data.entity_id, data);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("[]");
      });
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/history/period/")) {
      const ids = (url.searchParams.get("filter_entity_id") || "").split(",");
      const lists = ids.filter((id) => states.has(id)).map((id) => [{ entity_id: id, state: states.get(id).state, last_changed: new Date().toISOString() }]);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(lists));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    states,
    set,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); })
  };
}
