import dns from "node:dns";
import { EventEmitter } from "node:events";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const DNS_TTL_MS = 5 * 60_000;
const WS_CONNECT_TIMEOUT_MS = 15_000;
const dnsCache = new Map();

/**
 * dns.lookup with a short cache and IPv4 first. mDNS names like
 * homeassistant.local can take seconds to resolve on Windows and often return
 * an unroutable link-local IPv6 address first.
 */
export function cachedLookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  const key = `${hostname}|${options.family || 0}`;
  const hit = dnsCache.get(key);
  const reply = (addresses) => {
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  };
  if (hit && hit.expires > Date.now()) return reply(hit.addresses);

  dns.lookup(hostname, { family: options.family || 0, all: true, order: "ipv4first" }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses?.length) return callback(Object.assign(new Error(`No address for ${hostname}`), { code: "ENOTFOUND" }));
    dnsCache.set(key, { addresses, expires: Date.now() + DNS_TTL_MS });
    reply(addresses);
  });
}

function lookupAsync(hostname) {
  return new Promise((resolve, reject) => {
    cachedLookup(hostname, {}, (error, address, family) => (error ? reject(error) : resolve({ address, family })));
  });
}

export class HaError extends Error {
  constructor(message, status = 502, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Home Assistant connection: REST for reads/commands, WebSocket for live
 * `state_changed` events, REST polling while the WebSocket is down.
 *
 * Events: "states" (HaEntity[] full snapshot), "entity" (HaEntity), "status" ({ connected, transport, error })
 */
export class HaClient extends EventEmitter {
  constructor(config, logger, { WebSocketImpl = globalThis.WebSocket, resolveHosts = true } = {}) {
    super();
    this.resolveHosts = resolveHosts;
    this.config = config;
    this.log = logger;
    this.WebSocketImpl = WebSocketImpl;
    this.ws = null;
    this.msgId = 0;
    this.backoffMs = 1000;
    this.reconnectTimer = null;
    this.pollTimer = null;
    this.pingTimer = null;
    this.stopped = true;
    this.status = { connected: false, transport: "none", error: null, lastMessageAt: null };
  }

  // ─── REST ───────────────────────────────────────────────────────────────────

  request(apiPath, { method = "GET", body = null, timeoutMs = 12_000 } = {}) {
    const url = new URL(apiPath, `${this.config.haUrl}/`);
    const client = url.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    return new Promise((resolve, reject) => {
      const req = client.request(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.haToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
        },
        timeout: timeoutMs,
        lookup: cachedLookup
      }, (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          let parsed = null;
          if (data) {
            try { parsed = JSON.parse(data); } catch { parsed = data; }
          }
          if (res.statusCode === 401) return reject(new HaError("Home Assistant rejected the access token (401)", 502));
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const detail = typeof parsed === "object" && parsed?.message ? `: ${parsed.message}` : "";
            return reject(new HaError(`Home Assistant returned ${res.statusCode}${detail}`, 502, parsed));
          }
          resolve(parsed);
        });
      });
      req.on("timeout", () => req.destroy(new HaError("Home Assistant request timed out", 504)));
      req.on("error", (error) => {
        reject(error instanceof HaError ? error : new HaError(`Cannot reach Home Assistant: ${error.message}`, 502));
      });
      if (payload) req.write(payload);
      req.end();
    });
  }

  getStates() {
    return this.request("/api/states");
  }

  callService(domain, service, data) {
    return this.request(`/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, { method: "POST", body: data });
  }

  /** Raw HA history for entity ids since `start` (Date). Returns HaEntity[][]. */
  history(entityIds, start, end = new Date()) {
    const params = new URLSearchParams({
      filter_entity_id: entityIds.join(","),
      end_time: end.toISOString(),
      minimal_response: "",
      no_attributes: "",
      significant_changes_only: ""
    });
    return this.request(`/api/history/period/${encodeURIComponent(start.toISOString())}?${params}`, { timeoutMs: 20_000 });
  }

  // ─── Live connection ────────────────────────────────────────────────────────

  start() {
    this.stopped = false;
    this.refresh().catch((error) => this.setStatus({ connected: false, error: error.message }));
    if (this.WebSocketImpl) this.connect();
    else {
      this.log.warn("WebSocket is unavailable in this Node runtime; using REST polling");
      this.startPolling();
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pollTimer);
    clearInterval(this.pingTimer);
    this.pollTimer = null;
    if (this.ws) {
      try { this.ws.close(); } catch { /* already closed */ }
      this.ws = null;
    }
  }

  /** Fetch a full REST snapshot and emit it. */
  async refresh() {
    const states = await this.getStates();
    if (Array.isArray(states)) {
      this.status.lastMessageAt = Date.now();
      this.emit("states", states);
      if (this.status.transport !== "websocket") this.setStatus({ connected: true, transport: "polling", error: null });
    }
    return states;
  }

  setStatus(patch) {
    const next = { ...this.status, ...patch };
    const changed = next.connected !== this.status.connected || next.transport !== this.status.transport || next.error !== this.status.error;
    this.status = next;
    if (changed) this.emit("status", { ...this.status });
  }

  startPolling() {
    if (this.pollTimer || this.stopped) return;
    this.pollTimer = setInterval(() => {
      this.refresh().catch((error) => this.setStatus({ connected: false, transport: "polling", error: error.message }));
    }, this.config.pollIntervalMs);
  }

  stopPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /** WebSocket URL. For plain ws:// we connect to the resolved IPv4 address (see cachedLookup). */
  async socketUrl() {
    const url = new URL("/api/websocket", `${this.config.haUrl.replace(/^http/, "ws")}/`);
    if (url.protocol === "ws:" && !net.isIP(url.hostname) && this.resolveHosts) {
      try {
        const { address, family } = await lookupAsync(url.hostname);
        url.hostname = family === 6 ? `[${address}]` : address;
      } catch (error) {
        this.log.debug(`DNS lookup for ${url.hostname} failed: ${error.message}`);
      }
    }
    return url.href;
  }

  async connect() {
    if (this.stopped) return;
    let ws;
    try {
      ws = new this.WebSocketImpl(await this.socketUrl());
    } catch (error) {
      this.log.warn(`WebSocket connect failed: ${error.message}`);
      return this.scheduleReconnect();
    }
    if (this.stopped) return ws.close?.();
    this.ws = ws;
    let authenticated = false;
    const connectTimer = setTimeout(() => {
      if (authenticated) return;
      this.log.debug("WebSocket connect timed out");
      try { ws.close(); } catch { /* ignore */ }
    }, WS_CONNECT_TIMEOUT_MS);
    connectTimer.unref?.();
    const pending = new Map();
    let subscriptionId = null;

    const send = (msg) => {
      const id = ++this.msgId;
      ws.send(JSON.stringify({ id, ...msg }));
      return id;
    };

    ws.addEventListener("message", (event) => {
      let msg;
      try { msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString()); } catch { return; }
      this.status.lastMessageAt = Date.now();

      if (msg.type === "auth_required") {
        ws.send(JSON.stringify({ type: "auth", access_token: this.config.haToken }));
      } else if (msg.type === "auth_invalid") {
        this.log.error("Home Assistant WebSocket auth failed — check HA_TOKEN");
        this.setStatus({ connected: false, transport: "polling", error: "Access token rejected" });
        ws.close();
      } else if (msg.type === "auth_ok") {
        authenticated = true;
        clearTimeout(connectTimer);
        this.backoffMs = 1000;
        pending.set(send({ type: "get_states" }), "states");
        subscriptionId = send({ type: "subscribe_events", event_type: "state_changed" });
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          try { send({ type: "ping" }); } catch { /* socket closing */ }
        }, 30_000);
      } else if (msg.type === "result" && pending.get(msg.id) === "states") {
        pending.delete(msg.id);
        if (msg.success && Array.isArray(msg.result)) this.emit("states", msg.result);
      } else if (msg.type === "result" && msg.id === subscriptionId) {
        if (msg.success) {
          this.stopPolling();
          this.setStatus({ connected: true, transport: "websocket", error: null });
          this.log.info("Subscribed to Home Assistant state changes");
        }
      } else if (msg.type === "event" && msg.id === subscriptionId) {
        const newState = msg.event?.data?.new_state;
        if (newState?.entity_id) this.emit("entity", newState);
      }
    });

    let closed = false;
    ws.addEventListener("close", () => {
      if (closed) return;
      closed = true;
      clearTimeout(connectTimer);
      clearInterval(this.pingTimer);
      if (this.ws === ws) this.ws = null;
      if (this.stopped) return;
      this.setStatus({ connected: false, transport: "polling" });
      this.startPolling();
      this.scheduleReconnect();
    });

    ws.addEventListener("error", (event) => {
      this.log.debug(`WebSocket error: ${event?.message || "connection error"}`);
    });
  }

  scheduleReconnect() {
    if (this.stopped) return;
    clearTimeout(this.reconnectTimer);
    const delay = this.backoffMs;
    this.backoffMs = Math.min(60_000, this.backoffMs * 2);
    this.log.debug(`Reconnecting to Home Assistant WebSocket in ${Math.round(delay / 1000)}s`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  async findEntities(needles) {
    const states = await this.getStates();
    return states
      .filter((entity) => {
        const haystack = [
          entity.entity_id,
          entity.attributes?.friendly_name,
          entity.attributes?.device_class,
          entity.attributes?.unit_of_measurement
        ].join(" ").toLowerCase();
        return needles.length === 0 || needles.some((needle) => haystack.includes(needle));
      })
      .slice(0, 120)
      .map((entity) => ({
        entity_id: entity.entity_id,
        state: entity.state,
        friendly_name: entity.attributes?.friendly_name || "",
        unit: entity.attributes?.unit_of_measurement || ""
      }));
  }
}
