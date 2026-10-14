import { test } from "node:test";
import assert from "node:assert/strict";
import { diffActivity } from "../server/store.js";
import { buildConfig, validateConfig } from "../server/config.js";

const base = { locked: true, charging: false, chargerConnected: true, climate: false, frunk: false, sentry: true, battery: 70, chargeLimit: 80, location: "Home", tempUnit: "F", targetTemp: 70 };

test("no activity on the first snapshot", () => {
  assert.deepEqual(diffActivity(null, base), []);
});

test("derives activity from transitions", () => {
  const titles = diffActivity(base, { ...base, locked: false, charging: true, chargeLimit: 90, location: "Away" }).map((i) => i.title);
  assert.deepEqual(titles, ["Vehicle unlocked", "Charging started", "Charge limit changed", "Left Home"]);
});

test("null → value is not a change", () => {
  assert.deepEqual(diffActivity({ ...base, locked: null }, base), []);
});

test("validateConfig flags unsafe and malformed settings", () => {
  const exposed = validateConfig(buildConfig({ HOST: "0.0.0.0" }));
  assert.equal(exposed.errors.length, 1);
  assert.equal(validateConfig(buildConfig({ HOST: "0.0.0.0", DASHBOARD_ACCESS_TOKEN: "x" })).errors.length, 0);
  const trusted = validateConfig(buildConfig({ HOST: "0.0.0.0", TRUST_NETWORK: "1" }));
  assert.equal(trusted.errors.length, 0);
  assert.equal(trusted.warnings.length, 1);
  const bad = validateConfig(buildConfig({ HA_ENTITY_LOCK: "Lock Y", HA_URL: "ha.local" }));
  assert.equal(bad.warnings.length, 1);
  assert.equal(bad.errors.length, 1);
});

test("mock mode when HA is not configured or MOCK=1", () => {
  assert.equal(buildConfig({}).mock, true);
  assert.equal(buildConfig({ HA_URL: "http://ha", HA_TOKEN: "t" }).mock, false);
  assert.equal(buildConfig({ HA_URL: "http://ha", HA_TOKEN: "t", MOCK: "1" }).mock, true);
});
