/**
 * Pure translation from Home Assistant entity objects to the dashboard's vehicle
 * state. Anything missing, `unknown` or `unavailable` becomes `null` — the UI
 * renders that as "—" instead of inventing a value.
 */

const MISSING = new Set(["", "unknown", "unavailable", "none", "null"]);
const ON = new Set(["on", "true", "charging", "starting", "heat", "cool", "heat_cool", "auto", "dry", "fan_only", "open", "opening"]);
const OFF = new Set(["off", "false", "stopped", "complete", "disconnected", "no_power", "closed", "closing"]);
const SEAT_LEVELS = { off: 0, low: 1, lo: 1, medium: 2, med: 2, mid: 2, high: 3, hi: 3 };

/** @typedef {{ entity_id: string, state: string, attributes?: Record<string, any>, last_changed?: string, last_updated?: string }} HaEntity */

/** Raw state string, or null when the entity is absent or not reporting. */
export function rawState(entity) {
  if (!entity) return null;
  const value = String(entity.state ?? "").trim();
  return MISSING.has(value.toLowerCase()) ? null : value;
}

export function toNumber(value, decimals = null) {
  if (value === null || value === undefined) return null;
  const n = Number.parseFloat(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (decimals === null) return n;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function toBool(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).toLowerCase();
  if (ON.has(v)) return true;
  if (OFF.has(v)) return false;
  return null;
}

export function lockState(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).toLowerCase();
  if (["locked", "locking", "on", "true"].includes(v)) return true;
  if (["unlocked", "unlocking", "open", "opening", "off", "false", "jammed"].includes(v)) return false;
  return null;
}

export function seatLevel(entity) {
  const value = rawState(entity);
  if (value === null) return null;
  const named = SEAT_LEVELS[value.toLowerCase()];
  if (named !== undefined) return named;
  const options = entity.attributes?.options;
  if (Array.isArray(options)) {
    const index = options.findIndex((opt) => String(opt).toLowerCase() === value.toLowerCase());
    if (index >= 0) return Math.min(3, index);
  }
  const n = toNumber(value);
  return n === null ? null : Math.max(0, Math.min(3, Math.round(n)));
}

export function distanceUnit(unit) {
  const u = String(unit || "").toLowerCase();
  if (u === "km" || u === "kilometers") return "km";
  if (u === "mi" || u === "miles") return "mi";
  return null;
}

export function temperatureUnit(unit) {
  const u = String(unit || "").toUpperCase().replace("°", "");
  if (u === "C") return "C";
  if (u === "F") return "F";
  return null;
}

function powerKw(entity) {
  const value = toNumber(rawState(entity));
  if (value === null) return null;
  const unit = String(entity.attributes?.unit_of_measurement || "kW").toLowerCase();
  if (unit === "w") return Math.round(value / 100) / 10;
  if (unit === "mw") return value * 1000;
  return Math.round(value * 10) / 10;
}

function energyKwh(entity) {
  const value = toNumber(rawState(entity));
  if (value === null) return null;
  const unit = String(entity.attributes?.unit_of_measurement || "kWh").toLowerCase();
  if (unit === "wh") return Math.round(value / 10) / 100;
  return Math.round(value * 100) / 100;
}

function formatLocation(value) {
  if (value === null) return null;
  if (value === "home") return "Home";
  if (value === "not_home") return "Away";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(value) {
  if (value === null) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

/**
 * @param {(key: string) => HaEntity | undefined} get  lookup by dashboard entity key
 * @param {{ tempUnit?: string }} [options]
 */
export function normalizeVehicle(get, options = {}) {
  const value = (key) => rawState(get(key));
  // Buttons/scripts are momentary: their state is a timestamp, so treat them as "off".
  const momentary = (key) => /^(button|script)\./.test(get(key)?.entity_id || "");
  const bool = (key) => (momentary(key) ? false : toBool(value(key)));
  const attr = (key, name) => get(key)?.attributes?.[name];
  const unitOf = (key) => attr(key, "unit_of_measurement");

  const chargingRaw = value("charging");
  const charging = toBool(chargingRaw);
  const connectedEntity = toBool(value("chargerConnected"));
  const chargerConnected = connectedEntity !== null
    ? connectedEntity
    : chargingRaw && chargingRaw.toLowerCase() === "disconnected" ? false
      : charging ? true : null;

  const rangeUnit = distanceUnit(unitOf("range")) || distanceUnit(unitOf("odometer"));
  const tempUnit = temperatureUnit(unitOf("cabinTemp"))
    || temperatureUnit(unitOf("outsideTemp"))
    || temperatureUnit(attr("climate", "temperature_unit"))
    || temperatureUnit(options.tempUnit)
    || (rangeUnit === "km" ? "C" : "F");

  const climateRaw = value("climate");
  const update = get("softwareUpdate");

  return {
    battery: toNumber(value("battery") ?? attr("battery", "battery_level"), 0),
    range: toNumber(value("range"), 0),
    distanceUnit: rangeUnit || "mi",
    charging,
    chargerConnected,
    chargePower: powerKw(get("chargePower")),
    chargeRate: toNumber(value("chargeRate"), 0),
    chargeRateUnit: unitOf("chargeRate") || null,
    chargeLimit: toNumber(value("chargeLimit"), 0),
    chargeLimitMin: toNumber(attr("chargeLimit", "min"), 0) ?? 50,
    chargeLimitMax: toNumber(attr("chargeLimit", "max"), 0) ?? 100,
    energyAdded: energyKwh(get("energyAdded")),
    locked: lockState(value("lock")),
    climate: climateRaw === null ? null : climateRaw.toLowerCase() !== "off" && toBool(climateRaw) !== false,
    cabinTemp: toNumber(value("cabinTemp") ?? attr("climate", "current_temperature"), 1),
    targetTemp: toNumber(attr("climate", "temperature"), 1),
    targetTempMin: toNumber(attr("climate", "min_temp"), 1),
    targetTempMax: toNumber(attr("climate", "max_temp"), 1),
    outsideTemp: toNumber(value("outsideTemp"), 1),
    tempUnit,
    seatHeatDriver: seatLevel(get("seatHeatDriver")),
    seatHeatPassenger: seatLevel(get("seatHeatPassenger")),
    frunk: bool("frunk"),
    defrost: bool("defrost"),
    defrostRear: bool("defrostRear"),
    sentry: bool("sentry"),
    hazard: bool("hazard"),
    odometer: toNumber(value("odometer"), 1),
    softwareVersion: update ? (update.attributes?.installed_version ?? null) : null,
    latestVersion: update ? (update.attributes?.latest_version ?? null) : null,
    updateAvailable: update ? toBool(rawState(update)) : null,
    location: formatLocation(value("location")),
    departureEnabled: bool("departureEnabled"),
    departureTime: formatTime(value("departureTime"))
  };
}

/** Latest `last_updated` across the given entities, as ISO string. */
export function latestUpdate(entities) {
  let latest = 0;
  for (const entity of entities) {
    const t = Date.parse(entity?.last_updated || entity?.last_changed || "");
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  return latest ? new Date(latest).toISOString() : null;
}
