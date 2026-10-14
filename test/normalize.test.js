import { test } from "node:test";
import assert from "node:assert/strict";
import { lockState, normalizeVehicle, rawState, seatLevel, toBool, latestUpdate } from "../server/normalize.js";

const entity = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes });

function fromMap(map) {
  return (key) => map[key];
}

test("rawState treats unknown/unavailable as missing", () => {
  assert.equal(rawState(undefined), null);
  assert.equal(rawState(entity("sensor.x", "unknown")), null);
  assert.equal(rawState(entity("sensor.x", "unavailable")), null);
  assert.equal(rawState(entity("sensor.x", "42")), "42");
});

test("toBool and lockState map HA states", () => {
  assert.equal(toBool("on"), true);
  assert.equal(toBool("charging"), true);
  assert.equal(toBool("off"), false);
  assert.equal(toBool("disconnected"), false);
  assert.equal(toBool("weird"), null);
  assert.equal(lockState("locked"), true);
  assert.equal(lockState("unlocked"), false);
  assert.equal(lockState("jammed"), false);
  assert.equal(lockState(null), null);
});

test("missing entities normalize to null, never to mock values", () => {
  const v = normalizeVehicle(() => undefined);
  for (const key of ["battery", "range", "charging", "locked", "climate", "cabinTemp", "odometer", "sentry"]) {
    assert.equal(v[key], null, key);
  }
  assert.equal(v.distanceUnit, "mi");
  assert.equal(v.tempUnit, "F");
});

test("normalizes a typical Tesla entity set", () => {
  const v = normalizeVehicle(fromMap({
    battery: entity("sensor.y_battery", "72.4", { unit_of_measurement: "%" }),
    range: entity("sensor.y_range", "231.6", { unit_of_measurement: "km" }),
    charging: entity("sensor.y_charging", "charging"),
    chargePower: entity("sensor.y_power", "11520", { unit_of_measurement: "W" }),
    chargeLimit: entity("number.y_limit", "80", { min: 50, max: 100 }),
    lock: entity("lock.y_doors", "locked"),
    climate: entity("climate.y_hvac", "heat_cool", { temperature: 21.5, current_temperature: 19.2 }),
    cabinTemp: entity("sensor.y_inside", "19.4", { unit_of_measurement: "°C" }),
    odometer: entity("sensor.y_odo", "18,420.37", { unit_of_measurement: "km" }),
    seatHeatDriver: entity("select.y_seat_left", "medium", { options: ["off", "low", "medium", "high"] }),
    softwareUpdate: entity("update.y_update", "on", { installed_version: "2025.32.3", latest_version: "2025.38.1" }),
    location: entity("device_tracker.y", "home"),
    departureTime: entity("time.y_departure", "07:30:00")
  }));

  assert.equal(v.battery, 72);
  assert.equal(v.range, 232);
  assert.equal(v.charging, true);
  assert.equal(v.chargerConnected, true, "charging implies connected");
  assert.equal(v.chargePower, 11.5, "W converted to kW");
  assert.equal(v.chargeLimit, 80);
  assert.equal(v.locked, true);
  assert.equal(v.climate, true);
  assert.equal(v.targetTemp, 21.5);
  assert.equal(v.cabinTemp, 19.4, "dedicated sensor wins over climate attribute");
  assert.equal(v.tempUnit, "C");
  assert.equal(v.odometer, 18420.4);
  assert.equal(v.distanceUnit, "km");
  assert.equal(v.seatHeatDriver, 2);
  assert.equal(v.updateAvailable, true);
  assert.equal(v.latestVersion, "2025.38.1");
  assert.equal(v.location, "Home");
  assert.equal(v.departureTime, "07:30");
});

test("climate off and disconnected charger", () => {
  const v = normalizeVehicle(fromMap({
    climate: entity("climate.y", "off"),
    charging: entity("sensor.y_charging", "disconnected")
  }));
  assert.equal(v.climate, false);
  assert.equal(v.charging, false);
  assert.equal(v.chargerConnected, false);
});

test("button entities are momentary (false), not unknown", () => {
  const v = normalizeVehicle(fromMap({ frunk: entity("button.y_open_frunk", "2025-01-01T00:00:00Z") }));
  assert.equal(v.frunk, false);
});

test("seatLevel falls back to option index and numbers", () => {
  assert.equal(seatLevel(entity("select.s", "Level 2", { options: ["Off", "Level 1", "Level 2", "Level 3"] })), 2);
  assert.equal(seatLevel(entity("number.s", "3")), 3);
  assert.equal(seatLevel(entity("select.s", "unavailable")), null);
});

test("latestUpdate picks the newest timestamp", () => {
  const iso = latestUpdate([
    { last_updated: "2025-01-01T10:00:00Z" },
    { last_updated: "2025-01-01T12:00:00Z" },
    {}
  ]);
  assert.equal(iso, "2025-01-01T12:00:00.000Z");
});
