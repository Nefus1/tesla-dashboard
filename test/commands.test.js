import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandError, capabilities, defaultService, resolveServiceCall, validateValue } from "../server/commands.js";
import { buildConfig } from "../server/config.js";

const config = buildConfig({
  HA_URL: "http://ha.local:8123",
  HA_TOKEN: "t",
  HA_ENTITY_LOCK: "lock.y_doors",
  HA_ENTITY_FRUNK: "cover.y_frunk",
  HA_ENTITY_CHARGING: "switch.y_charger",
  HA_ENTITY_CHARGE_LIMIT: "number.y_limit",
  HA_ENTITY_CLIMATE: "climate.y_hvac",
  HA_ENTITY_SEAT_HEAT_DRIVER: "select.y_seat_left",
  HA_ENTITY_HAZARD: "button.y_flash",
  HA_ENTITY_DEPARTURE_TIME: "time.y_departure",
  HA_SERVICE_SENTRY_ON: "script.sentry_on"
});

test("validateValue enforces types and clamps", () => {
  assert.equal(validateValue("locked", true), true);
  assert.throws(() => validateValue("locked", "yes"), CommandError);
  assert.equal(validateValue("chargeLimit", 120), 100);
  assert.equal(validateValue("chargeLimit", 10), 50);
  assert.equal(validateValue("chargeLimit", 79.6), 80);
  assert.throws(() => validateValue("chargeLimit", "abc"), CommandError);
  assert.equal(validateValue("targetTemp", 100, { tempUnit: "F" }), 82);
  assert.equal(validateValue("targetTemp", 10, { tempUnit: "C" }), 15);
  assert.equal(validateValue("targetTemp", 21.3, { tempUnit: "C" }), 21.5);
  assert.equal(validateValue("seatHeatDriver", 2), 2);
  assert.throws(() => validateValue("seatHeatDriver", 4), CommandError);
  assert.equal(validateValue("departureTime", "07:05"), "07:05");
  assert.throws(() => validateValue("departureTime", "7:5"), CommandError);
  assert.throws(() => validateValue("selfDestruct", true), /Unsupported/);
});

test("defaultService infers services from domains", () => {
  assert.equal(defaultService("lock.x", "on"), "lock.lock");
  assert.equal(defaultService("lock.x", "off"), "lock.unlock");
  assert.equal(defaultService("cover.x", "on"), "cover.open_cover");
  assert.equal(defaultService("switch.x", "off"), "switch.turn_off");
  assert.equal(defaultService("button.x", "on"), "button.press");
  assert.equal(defaultService("number.x", "number"), "number.set_value");
  assert.equal(defaultService("sensor.x", "on"), "");
});

test("resolveServiceCall builds HA service calls", () => {
  assert.deepEqual(resolveServiceCall("locked", false, config), { domain: "lock", service: "unlock", data: { entity_id: "lock.y_doors" } });
  assert.deepEqual(resolveServiceCall("chargeLimit", 85, config), { domain: "number", service: "set_value", data: { entity_id: "number.y_limit", value: 85 } });
  assert.deepEqual(resolveServiceCall("targetTemp", 21, config), { domain: "climate", service: "set_temperature", data: { entity_id: "climate.y_hvac", temperature: 21 } });
  assert.deepEqual(resolveServiceCall("hazard", true, config), { domain: "button", service: "press", data: { entity_id: "button.y_flash" } });
  assert.deepEqual(resolveServiceCall("departureTime", "06:45", config), { domain: "time", service: "set_value", data: { entity_id: "time.y_departure", time: "06:45:00" } });
});

test("seat heat maps level to the entity's own option names", () => {
  const getEntity = () => ({ attributes: { options: ["Off", "Low", "Medium", "High"] } });
  const call = resolveServiceCall("seatHeatDriver", 3, config, getEntity);
  assert.deepEqual(call, { domain: "select", service: "select_option", data: { entity_id: "select.y_seat_left", option: "High" } });
});

test("service overrides take precedence", () => {
  const withSentry = { ...config, entities: { ...config.entities, sentry: "switch.y_sentry" } };
  assert.equal(resolveServiceCall("sentry", true, withSentry).domain, "script");
  assert.equal(resolveServiceCall("sentry", false, withSentry).service, "turn_off");
});

test("unconfigured commands are rejected and reported as unavailable", () => {
  assert.throws(() => resolveServiceCall("sentry", true, config), /not configured/);
  const caps = capabilities(config);
  assert.equal(caps.locked, true);
  assert.equal(caps.sentry, false);
  assert.equal(caps.targetTemp, true, "targetTemp uses the climate entity");
  assert.ok(Object.values(capabilities({ ...config, mock: true })).every(Boolean));
});
