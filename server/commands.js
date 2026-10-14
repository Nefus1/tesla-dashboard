/**
 * Command registry: dashboard command → validated value → Home Assistant service call.
 */

export class CommandError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const SEAT_OPTIONS = ["off", "low", "medium", "high"];

/**
 * type: bool | number | level | time
 * entity: dashboard entity key (see config.ENTITY_KEYS)
 * on/off/service: config.services override keys
 */
export const COMMANDS = {
  charging: { type: "bool", entity: "charging", on: "chargingOn", off: "chargingOff", label: "Charging" },
  locked: { type: "bool", entity: "lock", on: "lockOn", off: "lockOff", label: "Lock" },
  frunk: { type: "bool", entity: "frunk", on: "frunkOn", off: "frunkOff", label: "Frunk" },
  climate: { type: "bool", entity: "climate", on: "climateOn", off: "climateOff", label: "Climate" },
  defrost: { type: "bool", entity: "defrost", on: "defrostOn", off: "defrostOff", label: "Front defrost" },
  defrostRear: { type: "bool", entity: "defrostRear", on: "defrostRearOn", off: "defrostRearOff", label: "Rear defrost" },
  sentry: { type: "bool", entity: "sentry", on: "sentryOn", off: "sentryOff", label: "Sentry" },
  hazard: { type: "bool", entity: "hazard", on: "hazardOn", off: "hazardOff", label: "Hazard lights" },
  departureEnabled: { type: "bool", entity: "departureEnabled", on: "departureEnabledOn", off: "departureEnabledOff", label: "Scheduled departure" },
  chargeLimit: { type: "number", entity: "chargeLimit", service: "chargeLimit", label: "Charge limit" },
  targetTemp: { type: "number", entity: "climate", service: "targetTemp", label: "Target temperature" },
  seatHeatDriver: { type: "level", entity: "seatHeatDriver", service: "seatHeatDriver", label: "Driver seat heat" },
  seatHeatPassenger: { type: "level", entity: "seatHeatPassenger", service: "seatHeatPassenger", label: "Passenger seat heat" },
  departureTime: { type: "time", entity: "departureTime", service: "departureTime", label: "Departure time" }
};

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Temperature bounds Tesla accepts, by unit, unless the entity reports its own. */
export function tempBounds(unit, entity) {
  const min = Number(entity?.attributes?.min_temp);
  const max = Number(entity?.attributes?.max_temp);
  if (Number.isFinite(min) && Number.isFinite(max) && max > min) return [min, max];
  return unit === "C" ? [15, 28] : [59, 82];
}

/** Validate and normalize a command value. Throws CommandError. */
export function validateValue(command, value, context = {}) {
  const def = COMMANDS[command];
  if (!def) throw new CommandError(`Unsupported command: ${command}`);

  switch (def.type) {
    case "bool":
      if (typeof value !== "boolean") throw new CommandError(`${def.label} expects true or false`);
      return value;
    case "number": {
      const n = Number(value);
      if (value === null || value === "" || !Number.isFinite(n)) throw new CommandError(`${def.label} expects a number`);
      if (command === "chargeLimit") {
        const min = Number(context.chargeLimitMin ?? 50);
        const max = Number(context.chargeLimitMax ?? 100);
        return clamp(Math.round(n), min, max);
      }
      const [min, max] = tempBounds(context.tempUnit, context.climateEntity);
      return clamp(Math.round(n * 2) / 2, min, max);
    }
    case "level": {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 3) throw new CommandError(`${def.label} expects a level from 0 to 3`);
      return n;
    }
    case "time": {
      const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value));
      if (!match) throw new CommandError(`${def.label} expects HH:MM`);
      return `${match[1]}:${match[2]}`;
    }
    default:
      throw new CommandError(`Unsupported command: ${command}`);
  }
}

/** Infer an HA service from the entity domain (moved from the prototype server). */
export function defaultService(entityId, intent) {
  const domain = entityId.split(".")[0];

  if (intent === "number") {
    if (domain === "number") return "number.set_value";
    if (domain === "input_number") return "input_number.set_value";
    return "";
  }
  if (intent === "temperature") return domain === "climate" ? "climate.set_temperature" : "";
  if (intent === "select") {
    if (domain === "select") return "select.select_option";
    if (domain === "input_select") return "input_select.select_option";
    return "";
  }
  if (intent === "time") {
    if (domain === "time") return "time.set_value";
    if (domain === "input_datetime") return "input_datetime.set_datetime";
    return "";
  }

  const on = intent === "on";
  if (domain === "lock") return on ? "lock.lock" : "lock.unlock";
  if (domain === "cover") return on ? "cover.open_cover" : "cover.close_cover";
  if (domain === "climate") return on ? "climate.turn_on" : "climate.turn_off";
  if (domain === "button") return "button.press";
  if (domain === "script") return "script.turn_on";
  if (domain === "input_boolean") return on ? "input_boolean.turn_on" : "input_boolean.turn_off";
  if (["sensor", "binary_sensor", "device_tracker", "update"].includes(domain)) return "";
  return on ? `${domain}.turn_on` : `${domain}.turn_off`;
}

function seatOption(entity, level) {
  const options = entity?.attributes?.options;
  if (Array.isArray(options) && options.length) {
    const wanted = SEAT_OPTIONS[level];
    const byName = options.find((opt) => String(opt).toLowerCase() === wanted);
    if (byName !== undefined) return byName;
    return options[Math.min(level, options.length - 1)];
  }
  return SEAT_OPTIONS[level];
}

/**
 * Resolve a validated command into an HA service call.
 * @param {string} command
 * @param {any} value  already validated
 * @param {{ entities: Record<string,string>, services: Record<string,string> }} config
 * @param {(entityId: string) => any} getEntity  current HA entity lookup (for select options)
 * @returns {{ domain: string, service: string, data: Record<string, any> }}
 */
export function resolveServiceCall(command, value, config, getEntity = () => undefined) {
  const def = COMMANDS[command];
  if (!def) throw new CommandError(`Unsupported command: ${command}`);

  const entityId = config.entities[def.entity];
  if (!entityId) throw new CommandError(`${def.label} is not configured (set HA_ENTITY for "${def.entity}" in .env)`);

  let service = "";
  const data = { entity_id: entityId };

  if (def.type === "bool") {
    service = config.services[value ? def.on : def.off] || defaultService(entityId, value ? "on" : "off");
  } else if (command === "chargeLimit") {
    service = config.services[def.service] || defaultService(entityId, "number");
    data.value = value;
  } else if (command === "targetTemp") {
    service = config.services[def.service] || defaultService(entityId, "temperature");
    data.temperature = value;
  } else if (def.type === "level") {
    service = config.services[def.service] || defaultService(entityId, "select");
    data.option = seatOption(getEntity(entityId), value);
  } else if (def.type === "time") {
    service = config.services[def.service] || defaultService(entityId, "time");
    data.time = `${value}:00`;
  }

  if (!service || !service.includes(".")) {
    throw new CommandError(`No Home Assistant service available for ${entityId}; set a service override in .env`);
  }
  const [domain, serviceName] = service.split(".");
  return { domain, service: serviceName, data };
}

/** Which commands the UI may offer, given the config/mode. */
export function capabilities(config) {
  const result = {};
  for (const [command, def] of Object.entries(COMMANDS)) {
    result[command] = config.mock ? true : Boolean(config.entities[def.entity]);
  }
  return result;
}
