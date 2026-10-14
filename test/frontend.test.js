// The frontend's pure modules are plain ES modules, so Node can test them directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, fmtDistance, fmtDuration, fmtRelative, fmtTemp, fmtTimeOfDay, DASH } from "../public/js/format.js";
import { alerts, chargeColor, chargeEta, rangeOf, readiness } from "../public/js/derive.js";
import { effectiveVehicle, reconcilePending, settledPending } from "../public/js/store.js";

test("escapeHtml neutralizes markup", () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(escapeHtml(null), "");
});

test("formatters render null as a dash", () => {
  assert.equal(fmtTemp(null), DASH);
  assert.equal(fmtTemp(21.5, "C"), "21.5°C");
  assert.equal(fmtDistance(1234.56, "km", 1), "1,234.6 km");
  assert.equal(fmtDistance(undefined), DASH);
  assert.equal(fmtDuration(95), "1 h 35 min");
  assert.equal(fmtTimeOfDay("07:30"), "7:30 AM");
  assert.equal(fmtTimeOfDay("nope"), DASH);
});

test("fmtRelative", () => {
  const now = Date.parse("2025-06-15T12:00:00Z");
  assert.equal(fmtRelative("2025-06-15T11:59:58Z", now), "just now");
  assert.equal(fmtRelative("2025-06-15T11:59:15Z", now), "45s ago");
  assert.equal(fmtRelative("2025-06-15T11:50:00Z", now), "10 min ago");
  assert.equal(fmtRelative("garbage", now), DASH);
});

test("chargeColor and rangeOf", () => {
  assert.equal(chargeColor({ battery: 50, charging: true }), "var(--green)");
  assert.equal(chargeColor({ battery: 15, charging: false }), "var(--red)");
  assert.equal(chargeColor({ battery: null }), "var(--faint)");
  assert.equal(rangeOf({ range: 200, battery: 10 }), 200);
  assert.equal(rangeOf({ range: null, battery: 50, distanceUnit: "mi" }), 161);
  assert.equal(rangeOf({ range: null, battery: null }), null);
});

test("chargeEta needs real power data", () => {
  const now = Date.parse("2025-06-15T12:00:00Z");
  const eta = chargeEta({ charging: true, battery: 60, chargeLimit: 80, chargePower: 7.5 }, 75, now);
  assert.equal(eta.minutes, 120);
  assert.equal(chargeEta({ charging: true, battery: 60, chargeLimit: 80, chargePower: null }), null);
  assert.equal(chargeEta({ charging: true, battery: 80, chargeLimit: 80, chargePower: 7 }), null);
});

test("readiness and alerts", () => {
  assert.equal(readiness({ locked: true }).label, "Ready");
  assert.equal(readiness({ locked: false, frunk: true }).detail, "Frunk is open · Vehicle unlocked");
  const list = alerts({ source: "home-assistant", connected: false, error: "timeout", missingEntities: [{ key: "x", entityId: "sensor.x" }], vehicle: { frunk: true } });
  assert.deepEqual(list.map((a) => a.id), ["ha", "missing", "frunk"]);
  assert.equal(alerts(null, "offline")[0].id, "offline");
});

test("optimistic values overlay the snapshot until confirmed or expired", () => {
  const now = 1_000_000;
  const state = { snapshot: { vehicle: { locked: true, sentry: true } }, pending: { locked: { value: false, inFlight: true } } };
  assert.equal(effectiveVehicle(state, now).locked, false);

  const settled = { locked: settledPending(false, now) };
  assert.deepEqual(reconcilePending(settled, { locked: true }, now + 1000), settled, "kept while server catches up");
  assert.deepEqual(reconcilePending(settled, { locked: false }, now + 1000), {}, "dropped once confirmed");
  assert.deepEqual(reconcilePending(settled, { locked: true }, now + 60_000), {}, "dropped once expired");
});
