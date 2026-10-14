/**
 * History aggregation. All functions are pure and take series of `{ t, v }`
 * points (epoch ms, number), so mock and Home Assistant data share one path.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Convert one HA history list (minimal_response) into a sorted numeric series. */
export function toSeries(list, parse = (s) => Number.parseFloat(s)) {
  if (!Array.isArray(list)) return [];
  return list
    .map((point) => ({ t: Date.parse(point.last_changed || point.last_updated || ""), v: parse(point.state) }))
    .filter((p) => Number.isFinite(p.t) && p.v !== null && p.v !== undefined && !Number.isNaN(p.v))
    .sort((a, b) => a.t - b.t);
}

/** Boolean series from HA states (on/charging → true). */
export function toBoolSeries(list) {
  return toSeries(list, (s) => {
    const v = String(s).toLowerCase();
    if (["on", "true", "charging", "starting"].includes(v)) return true;
    if (["unknown", "unavailable", ""].includes(v)) return null;
    return false;
  });
}

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfHour(ms) {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function dayKey(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function round(n, decimals = 1) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function valueAt(series, t) {
  let value = null;
  for (const p of series) {
    if (p.t > t) break;
    value = p.v;
  }
  return value;
}

/** Empty day buckets for the last `days` days ending today (oldest first). */
export function dayBuckets(days, now) {
  const today = startOfDay(now);
  return Array.from({ length: days }, (_, i) => {
    const start = today - (days - 1 - i) * DAY_MS;
    return { date: dayKey(start), label: WEEKDAYS[new Date(start).getDay()], start, end: start + DAY_MS, value: 0 };
  });
}

/**
 * kWh added per day: sum of positive battery-% deltas × capacity. When a
 * charging series is supplied, only deltas that happen while charging count
 * (filters out regen and sensor jitter).
 */
export function chargingByDay(battery, charging, capacityKwh, days, now) {
  const buckets = dayBuckets(days, now);
  for (let i = 1; i < battery.length; i++) {
    const delta = battery[i].v - battery[i - 1].v;
    if (delta <= 0) continue;
    if (charging && charging.length && valueAt(charging, battery[i].t) === false) continue;
    const bucket = buckets.find((b) => battery[i].t >= b.start && battery[i].t < b.end);
    if (bucket) bucket.value += (delta / 100) * capacityKwh;
  }
  return buckets.map(({ date, label, value }) => ({ date, label, kWh: round(value) }));
}

/** kWh used per day: negative battery-% deltas × capacity. */
export function usageByDay(battery, capacityKwh, days, now) {
  const buckets = dayBuckets(days, now);
  for (let i = 1; i < battery.length; i++) {
    const delta = battery[i].v - battery[i - 1].v;
    if (delta >= 0) continue;
    const bucket = buckets.find((b) => battery[i].t >= b.start && battery[i].t < b.end);
    if (bucket) bucket.value += (-delta / 100) * capacityKwh;
  }
  return buckets.map(({ date, label, value }) => ({ date, label, kWh: round(value) }));
}

/** kWh used per hour over the last 24 hours (oldest first): negative battery deltas × capacity. */
export function usageByHour(battery, capacityKwh, now) {
  const end = startOfHour(now) + HOUR_MS;
  const buckets = Array.from({ length: 24 }, (_, i) => {
    const start = end - (24 - i) * HOUR_MS;
    return { hour: new Date(start).getHours(), start, value: 0 };
  });
  for (let i = 1; i < battery.length; i++) {
    const delta = battery[i].v - battery[i - 1].v;
    if (delta >= 0) continue;
    const bucket = buckets.find((b) => battery[i].t >= b.start && battery[i].t < b.start + HOUR_MS);
    if (bucket) bucket.value += (-delta / 100) * capacityKwh;
  }
  return buckets.map(({ hour, value }) => ({ hour, kWh: round(value, 2) }));
}

/** Distance per day from odometer readings (sum of forward deltas). */
export function distanceByDay(odometer, days, now) {
  const buckets = dayBuckets(days, now);
  for (let i = 1; i < odometer.length; i++) {
    const delta = odometer[i].v - odometer[i - 1].v;
    if (delta <= 0 || delta > 2000) continue;
    const bucket = buckets.find((b) => odometer[i].t >= b.start && odometer[i].t < b.end);
    if (bucket) bucket.value += delta;
  }
  return buckets.map(({ date, label, value }) => ({ date, label, distance: round(value) }));
}

/** Build the /api/history payload from raw series. */
export function summarizeHistory({ battery = [], charging = [], odometer = [] }, vehicle, now = Date.now(), days = 7) {
  const chargingDays = chargingByDay(battery, charging, vehicle.batteryCapacityKwh, days, now);
  const usage = usageByHour(battery, vehicle.batteryCapacityKwh, now);
  const distance = distanceByDay(odometer, days, now);
  const usedDays = usageByDay(battery, vehicle.batteryCapacityKwh, days, now);
  const charged = chargingDays.reduce((s, d) => s + d.kWh, 0);
  const used = usage.reduce((s, h) => s + h.kWh, 0);
  const usedWeek = usedDays.reduce((s, d) => s + d.kWh, 0);
  const distanceWeek = distance.reduce((s, d) => s + d.distance, 0);

  return {
    generatedAt: new Date(now).toISOString(),
    available: { battery: battery.length > 1, odometer: odometer.length > 1 },
    rate: vehicle.electricityRate,
    currency: vehicle.currency,
    charging: chargingDays,
    usage24h: usage,
    usage: usedDays,
    distance,
    totals: {
      chargedKwh: round(charged),
      chargedCost: round(charged * vehicle.electricityRate, 2),
      usedKwh24h: round(used),
      usedCost24h: round(used * vehicle.electricityRate, 2),
      usedKwh: round(usedWeek),
      distance: round(distanceWeek),
      // Wh per distance unit; only meaningful once the car has actually moved.
      efficiency: distanceWeek >= 5 ? Math.round((usedWeek * 1000) / distanceWeek) : null
    }
  };
}
