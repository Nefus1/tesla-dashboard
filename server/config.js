import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_DIR = path.join(ROOT, "public");

/**
 * Entity keys the dashboard understands, mapped to their env variable suffix.
 * All are optional; unmapped entities surface as `null` in the vehicle state.
 */
export const ENTITY_KEYS = {
  battery: "BATTERY",
  range: "RANGE",
  charging: "CHARGING",
  chargerConnected: "CHARGER_CONNECTED",
  chargePower: "CHARGE_POWER",
  chargeRate: "CHARGE_RATE",
  chargeLimit: "CHARGE_LIMIT",
  energyAdded: "ENERGY_ADDED",
  lock: "LOCK",
  climate: "CLIMATE",
  cabinTemp: "CABIN_TEMP",
  outsideTemp: "OUTSIDE_TEMP",
  seatHeatDriver: "SEAT_HEAT_DRIVER",
  seatHeatPassenger: "SEAT_HEAT_PASSENGER",
  frunk: "FRUNK",
  defrost: "DEFROST",
  defrostRear: "DEFROST_REAR",
  sentry: "SENTRY",
  hazard: "HAZARD",
  odometer: "ODOMETER",
  softwareUpdate: "SOFTWARE_UPDATE",
  location: "LOCATION",
  departureEnabled: "DEPARTURE_ENABLED",
  departureTime: "DEPARTURE_TIME"
};

/** Service override keys (HA_SERVICE_<SUFFIX>). */
export const SERVICE_KEYS = [
  "CHARGING_ON", "CHARGING_OFF", "LOCK_ON", "LOCK_OFF", "FRUNK_ON", "FRUNK_OFF",
  "CLIMATE_ON", "CLIMATE_OFF", "DEFROST_ON", "DEFROST_OFF", "DEFROST_REAR_ON", "DEFROST_REAR_OFF",
  "SENTRY_ON", "SENTRY_OFF", "HAZARD_ON", "HAZARD_OFF", "CHARGE_LIMIT", "TARGET_TEMP",
  "SEAT_HEAT_DRIVER", "SEAT_HEAT_PASSENGER", "DEPARTURE_ENABLED_ON", "DEPARTURE_ENABLED_OFF", "DEPARTURE_TIME"
];

const ENTITY_ID_RE = /^[a-z_]+\.[a-z0-9_]+$/;
const SERVICE_RE = /^[a-z_]+\.[a-z0-9_]+$/;

export function loadDotEnv(filePath, env = process.env) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined) env[key] = value;
  }
}

export function splitList(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function toCamel(suffix) {
  return suffix.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function isLoopback(host) {
  return ["127.0.0.1", "::1", "localhost"].includes(String(host).toLowerCase());
}

/**
 * Build the runtime config from an env object. Pure apart from reading `env`,
 * so tests can construct configs without touching process.env.
 */
export function buildConfig(env = process.env) {
  const entities = {};
  for (const [key, suffix] of Object.entries(ENTITY_KEYS)) {
    entities[key] = String(env[`HA_ENTITY_${suffix}`] || "").trim();
  }

  const services = {};
  for (const suffix of SERVICE_KEYS) {
    services[toCamel(suffix)] = String(env[`HA_SERVICE_${suffix}`] || "").trim();
  }

  const haUrl = trimSlash(env.HA_URL || "");
  const haToken = String(env.HA_TOKEN || "").trim();
  const forceMock = ["1", "true", "yes"].includes(String(env.MOCK || "").toLowerCase());

  return {
    host: env.HOST || "127.0.0.1",
    port: Number(env.PORT || 4173),
    logLevel: env.LOG_LEVEL || "info",
    accessToken: String(env.DASHBOARD_ACCESS_TOKEN || ""),
    trustNetwork: ["1", "true", "yes"].includes(String(env.TRUST_NETWORK || "").toLowerCase()),
    dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(ROOT, "data"),
    haUrl,
    haToken,
    mock: forceMock || !(haUrl && haToken),
    pollIntervalMs: positiveNumber(env.POLL_INTERVAL_MS, 30_000),
    tempUnit: String(env.TEMP_UNIT || "").toUpperCase(),
    entitySearch: splitList(env.HA_ENTITY_SEARCH || "tesla,model y"),
    entities,
    services,
    vehicle: {
      name: env.VEHICLE_NAME || "Model Y",
      model: env.VEHICLE_MODEL || "Model Y Long Range AWD",
      color: env.VEHICLE_COLOR || "",
      batteryCapacityKwh: positiveNumber(env.BATTERY_CAPACITY_KWH, 75),
      electricityRate: positiveNumber(env.ELECTRICITY_RATE, 0.15),
      currency: env.CURRENCY || "USD"
    }
  };
}

/** Return human-readable configuration problems (never throws). */
export function validateConfig(config) {
  const warnings = [];
  const errors = [];

  if (!isLoopback(config.host) && !config.accessToken) {
    const message = `HOST=${config.host} exposes the dashboard on the network; set DASHBOARD_ACCESS_TOKEN to protect it.`;
    if (config.trustNetwork) warnings.push(`${message} (TRUST_NETWORK=1 set — continuing)`);
    else errors.push(`${message} Set TRUST_NETWORK=1 only if access is restricted another way.`);
  }
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) {
    errors.push(`PORT must be an integer between 0 and 65535 (got ${config.port}).`);
  }
  if (config.haUrl && !/^https?:\/\//.test(config.haUrl)) {
    errors.push(`HA_URL must start with http:// or https:// (got ${config.haUrl}).`);
  }
  for (const [key, id] of Object.entries(config.entities)) {
    if (id && !ENTITY_ID_RE.test(id)) warnings.push(`HA_ENTITY_${ENTITY_KEYS[key]}="${id}" is not a valid entity id (domain.object_id).`);
  }
  for (const [key, service] of Object.entries(config.services)) {
    if (service && !SERVICE_RE.test(service)) warnings.push(`Service override ${key}="${service}" must look like domain.service.`);
  }
  return { warnings, errors };
}

/** Entity ids that are configured, for filtering HA events. */
export function configuredEntityIds(config) {
  return new Set(Object.values(config.entities).filter(Boolean));
}
