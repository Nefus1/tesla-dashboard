import { test } from "node:test";
import assert from "node:assert/strict";
import { HaClient, cachedLookup } from "../server/ha-client.js";
import { buildConfig } from "../server/config.js";
import { silent } from "./helpers.js";

/** Scriptable stand-in for the HA WebSocket API. */
class FakeSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.listeners = {};
    FakeSocket.instances.push(this);
    this.receive({ type: "auth_required" });
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, event) { for (const fn of this.listeners[type] || []) fn(event); }
  // Replies are async, like a real socket.
  receive(msg) { queueMicrotask(() => this.emit("message", { data: JSON.stringify(msg) })); }
  send(raw) {
    const msg = JSON.parse(raw);
    this.sent.push(msg);
    if (msg.type === "auth") this.receive(msg.access_token === "good" ? { type: "auth_ok" } : { type: "auth_invalid" });
    if (msg.type === "get_states") this.receive({ id: msg.id, type: "result", success: true, result: [{ entity_id: "lock.y", state: "locked" }] });
    if (msg.type === "subscribe_events") {
      this.subscription = msg.id;
      this.receive({ id: msg.id, type: "result", success: true, result: null });
    }
  }
  close() { this.emit("close", {}); }
}

const tick = () => new Promise((r) => setTimeout(r, 10));

test("authenticates, loads states and streams state_changed events", async () => {
  FakeSocket.instances = [];
  const config = buildConfig({ HA_URL: "http://ha.local:8123", HA_TOKEN: "good" });
  const client = new HaClient(config, silent, { WebSocketImpl: FakeSocket, resolveHosts: false });
  client.refresh = async () => []; // no REST in this test
  const seen = { states: null, entities: [], status: [] };
  client.on("states", (s) => { seen.states = s; });
  client.on("entity", (e) => seen.entities.push(e));
  client.on("status", (s) => seen.status.push(s));

  client.start();
  await tick();

  const ws = FakeSocket.instances[0];
  assert.equal(ws.url, "ws://ha.local:8123/api/websocket");
  assert.deepEqual(ws.sent[0], { type: "auth", access_token: "good" });
  assert.equal(seen.states.length, 1);
  assert.deepEqual(seen.status.at(-1), { connected: true, transport: "websocket", error: null, lastMessageAt: seen.status.at(-1).lastMessageAt });

  ws.receive({ id: ws.subscription, type: "event", event: { data: { entity_id: "lock.y", new_state: { entity_id: "lock.y", state: "unlocked" } } } });
  await tick();
  assert.equal(seen.entities[0].state, "unlocked");

  client.stop();
});

test("falls back to polling when the socket closes", async () => {
  FakeSocket.instances = [];
  const config = buildConfig({ HA_URL: "https://ha.example", HA_TOKEN: "good", POLL_INTERVAL_MS: "1000000" });
  const client = new HaClient(config, silent, { WebSocketImpl: FakeSocket, resolveHosts: false });
  client.refresh = async () => [];
  client.start();
  await tick();
  assert.equal(FakeSocket.instances[0].url, "wss://ha.example/api/websocket");

  FakeSocket.instances[0].close();
  assert.equal(client.status.connected, false);
  assert.equal(client.status.transport, "polling");
  assert.ok(client.pollTimer, "polling started");
  assert.ok(client.reconnectTimer, "reconnect scheduled");
  client.stop();
});

test("reports a rejected token", async () => {
  FakeSocket.instances = [];
  const config = buildConfig({ HA_URL: "http://ha.local", HA_TOKEN: "bad", POLL_INTERVAL_MS: "1000000" });
  const client = new HaClient(config, silent, { WebSocketImpl: FakeSocket, resolveHosts: false });
  client.refresh = async () => [];
  client.start();
  await tick();
  assert.equal(client.status.error, "Access token rejected");
  client.stop();
});

test("cachedLookup prefers IPv4 and supports all:true", async () => {
  const one = await new Promise((resolve, reject) => cachedLookup("localhost", {}, (e, address, family) => (e ? reject(e) : resolve({ address, family }))));
  assert.equal(one.family, 4);
  const all = await new Promise((resolve, reject) => cachedLookup("localhost", { all: true }, (e, list) => (e ? reject(e) : resolve(list))));
  assert.ok(Array.isArray(all) && all[0].family === 4);
});
