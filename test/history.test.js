import { test } from "node:test";
import assert from "node:assert/strict";
import { chargingByDay, distanceByDay, summarizeHistory, toBoolSeries, toSeries, usageByHour } from "../server/history.js";

// Fixed "now": local noon, so day buckets are unambiguous.
const now = new Date(2025, 5, 15, 12, 0, 0).getTime();
const today = (h, m = 0) => new Date(2025, 5, 15, h, m).getTime();
const yesterday = (h) => new Date(2025, 5, 14, h).getTime();

test("toSeries parses HA minimal history and drops junk", () => {
  const series = toSeries([
    { state: "50", last_changed: "2025-06-15T08:00:00Z" },
    { state: "unavailable", last_changed: "2025-06-15T08:30:00Z" },
    { state: "48", last_changed: "2025-06-15T07:00:00Z" }
  ]);
  assert.deepEqual(series.map((p) => p.v), [48, 50]);
  assert.deepEqual(toBoolSeries([{ state: "on", last_changed: "2025-06-15T08:00:00Z" }]).map((p) => p.v), [true]);
});

test("chargingByDay sums positive deltas while charging", () => {
  const battery = [
    { t: yesterday(1), v: 40 },
    { t: yesterday(3), v: 60 }, // +20% while charging
    { t: today(9), v: 55 },
    { t: today(10), v: 56 } // +1% regen, not charging
  ];
  const charging = [
    { t: yesterday(0), v: true },
    { t: yesterday(4), v: false }
  ];
  const days = chargingByDay(battery, charging, 75, 7, now);
  assert.equal(days.length, 7);
  assert.equal(days[5].kWh, 15, "20% of 75 kWh yesterday");
  assert.equal(days[6].kWh, 0, "regen bump ignored");
});

test("usageByHour buckets negative deltas into the last 24 hours", () => {
  const battery = [
    { t: today(8), v: 60 },
    { t: today(8, 30), v: 56 },
    { t: today(11, 15), v: 54 }
  ];
  const hours = usageByHour(battery, 50, now);
  assert.equal(hours.length, 24);
  assert.equal(hours[hours.length - 1].hour, 12, "last bucket is the current hour");
  const byHour = Object.fromEntries(hours.map((h) => [h.hour, h.kWh]));
  assert.equal(byHour[8], 2);
  assert.equal(byHour[11], 1);
});

test("distanceByDay sums forward odometer deltas", () => {
  const odometer = [
    { t: yesterday(8), v: 1000 },
    { t: yesterday(18), v: 1030 },
    { t: today(8), v: 1042.5 },
    { t: today(9), v: 1040 } // backwards glitch ignored
  ];
  const days = distanceByDay(odometer, 7, now);
  assert.equal(days[5].distance, 30);
  assert.equal(days[6].distance, 12.5);
});

test("summarizeHistory totals and efficiency", () => {
  const summary = summarizeHistory({
    battery: [{ t: today(8), v: 80 }, { t: today(9), v: 70 }],
    odometer: [{ t: today(8), v: 100 }, { t: today(9), v: 130 }]
  }, { batteryCapacityKwh: 75, electricityRate: 0.2, currency: "USD" }, now);

  assert.equal(summary.totals.usedKwh24h, 7.5);
  assert.equal(summary.totals.usedCost24h, 1.5);
  assert.equal(summary.totals.distance, 30);
  assert.equal(summary.totals.efficiency, 250, "7.5 kWh / 30 mi = 250 Wh/mi");
  assert.equal(summary.available.battery, true);
});

test("summarizeHistory with no data reports unavailable", () => {
  const summary = summarizeHistory({}, { batteryCapacityKwh: 75, electricityRate: 0.15, currency: "USD" }, now);
  assert.equal(summary.available.battery, false);
  assert.equal(summary.totals.efficiency, null);
  assert.equal(summary.charging.length, 7);
});

