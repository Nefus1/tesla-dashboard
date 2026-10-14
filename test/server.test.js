import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { json, startDashboard, startFakeHa, waitForEvent } from "./helpers.js";

describe("mock mode", () => {
  let ctx;
  before(async () => { ctx = await startDashboard({ MOCK: "1" }); });
  after(() => ctx.app.stop());

  test("health and state", async () => {
    const health = await json(ctx.base, "/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.data.mode, "mock");

    const state = await json(ctx.base, "/api/state");
    assert.equal(state.data.source, "mock");
    assert.equal(typeof state.data.vehicle.battery, "number");
  });

  test("security headers are set", async () => {
    const res = await json(ctx.base, "/api/state");
    assert.match(res.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  });

  test("static files are served only from public/", async () => {
    const index = await fetch(`${ctx.base}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-type"), /text\/html/);
    for (const p of ["/.env", "/server/app.js", "/package.json", "/%2e%2e/.env", "/.git/HEAD"]) {
      const res = await fetch(ctx.base + p);
      assert.equal(res.status, 404, p);
    }
  });

  test("commands change state and are pushed over SSE", async () => {
    const pushed = waitForEvent(`${ctx.base}/api/events`, (e) => e.event === "state" && e.data.vehicle?.sentry === false);
    const res = await json(ctx.base, "/api/command", { method: "POST", body: { command: "sentry", value: false } });
    assert.equal(res.status, 200);
    assert.equal(res.data.state.vehicle.sentry, false);
    await pushed;
  });

  test("commands are validated", async () => {
    const bad = await json(ctx.base, "/api/command", { method: "POST", body: { command: "locked", value: "nope" } });
    assert.equal(bad.status, 400);
    const unknown = await json(ctx.base, "/api/command", { method: "POST", body: { command: "explode", value: true } });
    assert.equal(unknown.status, 400);
    const limit = await json(ctx.base, "/api/command", { method: "POST", body: { command: "chargeLimit", value: 300 } });
    assert.equal(limit.data.state.vehicle.chargeLimit, 100);
  });

  test("activity is derived from state changes", async () => {
    await json(ctx.base, "/api/command", { method: "POST", body: { command: "frunk", value: true } });
    const activity = await json(ctx.base, "/api/activity");
    assert.ok(activity.data.items.some((item) => item.title === "Frunk opened"));
  });

  test("cross-origin and non-JSON writes are rejected", async () => {
    const cross = await json(ctx.base, "/api/command", { method: "POST", body: { command: "locked", value: false }, headers: { Origin: "https://evil.example" } });
    assert.equal(cross.status, 403);
    const form = await json(ctx.base, "/api/command", { method: "POST", body: "command=locked", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    assert.equal(form.status, 415);
  });

  test("trip reset and history", async () => {
    const reset = await json(ctx.base, "/api/trip/reset", { method: "POST", body: {} });
    assert.equal(reset.data.vehicle.tripA, 0);
    const history = await json(ctx.base, "/api/history");
    assert.equal(history.data.charging.length, 7);
    assert.equal(history.data.usage24h.length, 24);
  });

  test("unknown API routes 404, wrong methods 405", async () => {
    assert.equal((await json(ctx.base, "/api/nope")).status, 404);
    assert.equal((await json(ctx.base, "/api/command")).status, 405);
  });
});

describe("access token", () => {
  let ctx;
  before(async () => { ctx = await startDashboard({ MOCK: "1", DASHBOARD_ACCESS_TOKEN: "s3cret" }); });
  after(() => ctx.app.stop());

  test("rejects requests without the token", async () => {
    assert.equal((await json(ctx.base, "/api/state")).status, 401);
    assert.equal((await fetch(`${ctx.base}/`)).status, 401);
    assert.equal((await json(ctx.base, "/api/health")).status, 200, "health stays open for container checks");
  });

  test("accepts a bearer token and sets a cookie from ?token=", async () => {
    const bearer = await json(ctx.base, "/api/state", { headers: { Authorization: "Bearer s3cret" } });
    assert.equal(bearer.status, 200);
    const login = await fetch(`${ctx.base}/?token=s3cret`, { redirect: "manual" });
    assert.equal(login.status, 303);
    const cookie = login.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/);
    const withCookie = await json(ctx.base, "/api/state", { headers: { Cookie: cookie.split(";")[0] } });
    assert.equal(withCookie.status, 200);
  });
});

describe("home assistant mode", () => {
  let ha;
  let ctx;
  before(async () => {
    ha = await startFakeHa([
      { entity_id: "sensor.y_battery", state: "64", attributes: { unit_of_measurement: "%" } },
      { entity_id: "lock.y_doors", state: "locked" },
      { entity_id: "number.y_limit", state: "80", attributes: { min: 50, max: 100 } },
      { entity_id: "switch.y_sentry", state: "on" }
    ]);
    ctx = await startDashboard({
      HA_URL: ha.url,
      HA_TOKEN: "test-token",
      HA_ENTITY_BATTERY: "sensor.y_battery",
      HA_ENTITY_LOCK: "lock.y_doors",
      HA_ENTITY_CHARGE_LIMIT: "number.y_limit",
      HA_ENTITY_SENTRY: "switch.y_sentry",
      HA_ENTITY_ODOMETER: "sensor.y_missing"
    });
    // Wait for the first REST snapshot.
    for (let i = 0; i < 50 && !(await json(ctx.base, "/api/state")).data.vehicle; i++) await new Promise((r) => setTimeout(r, 20));
  });
  after(async () => {
    await ctx.app.stop();
    await ha.close();
  });

  test("reads and normalizes HA entities", async () => {
    const { data } = await json(ctx.base, "/api/state");
    assert.equal(data.source, "home-assistant");
    assert.equal(data.connected, true);
    assert.equal(data.vehicle.battery, 64);
    assert.equal(data.vehicle.locked, true);
    assert.equal(data.vehicle.range, null, "unmapped entities are null, not mock values");
    assert.deepEqual(data.missingEntities, [{ key: "odometer", entityId: "sensor.y_missing" }]);
  });

  test("capabilities reflect configured entities", async () => {
    const { data } = await json(ctx.base, "/api/config");
    assert.equal(data.mode, "home-assistant");
    assert.equal(data.capabilities.locked, true);
    assert.equal(data.capabilities.climate, false);
    assert.equal(JSON.stringify(data).includes("test-token"), false, "token never leaves the server");
  });

  test("commands call HA services", async () => {
    const res = await json(ctx.base, "/api/command", { method: "POST", body: { command: "locked", value: false } });
    assert.equal(res.status, 200);
    assert.deepEqual(ha.calls.at(-1), { service: "lock.unlock", data: { entity_id: "lock.y_doors" } });

    await json(ctx.base, "/api/command", { method: "POST", body: { command: "chargeLimit", value: 90 } });
    assert.deepEqual(ha.calls.at(-1), { service: "number.set_value", data: { entity_id: "number.y_limit", value: 90 } });
  });

  test("polling picks up the change and logs activity", async () => {
    const pushed = await waitForEvent(`${ctx.base}/api/events`, (e) => e.event === "state" && e.data.vehicle?.locked === false, 4000);
    assert.equal(pushed.data.vehicle.locked, false);
    const activity = await json(ctx.base, "/api/activity");
    assert.ok(activity.data.items.some((i) => i.title === "Vehicle unlocked"));
  });

  test("unconfigured commands return 409", async () => {
    const res = await json(ctx.base, "/api/command", { method: "POST", body: { command: "climate", value: true } });
    assert.equal(res.status, 409);
  });

  test("history comes from the HA history API", async () => {
    const { status, data } = await json(ctx.base, "/api/history");
    assert.equal(status, 200);
    assert.equal(data.charging.length, 7);
  });
});
