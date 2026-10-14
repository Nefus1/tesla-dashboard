/** Derived values computed from the vehicle snapshot. Pure — safe to import from Node tests. */

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** CSS custom property used to accent battery visuals. */
export function chargeColor(vehicle) {
  if (!vehicle || !isNum(vehicle.battery)) return "var(--faint)";
  if (vehicle.charging) return "var(--green)";
  if (vehicle.battery < 20) return "var(--red)";
  if (vehicle.battery < 40) return "var(--amber)";
  return "var(--blue)";
}

/** Range from the vehicle, or an EPA-style estimate (battery × 3.21 mi) when no range entity exists. */
export function rangeOf(vehicle) {
  if (!vehicle) return null;
  if (isNum(vehicle.range)) return vehicle.range;
  if (!isNum(vehicle.battery)) return null;
  const miles = vehicle.battery * 3.21;
  return Math.round(vehicle.distanceUnit === "km" ? miles * 1.609 : miles);
}

/** Minutes until the charge limit is reached plus the wall-clock time, or null. */
export function chargeEta(vehicle, capacityKwh = 75, now = Date.now()) {
  if (!vehicle?.charging || !isNum(vehicle.battery) || !isNum(vehicle.chargeLimit)) return null;
  if (vehicle.battery >= vehicle.chargeLimit) return null;
  if (!isNum(vehicle.chargePower) || vehicle.chargePower <= 0) return null;
  const kwhNeeded = ((vehicle.chargeLimit - vehicle.battery) / 100) * capacityKwh;
  const minutes = Math.round((kwhNeeded / vehicle.chargePower) * 60);
  return { minutes, at: new Date(now + minutes * 60_000) };
}

/** Headline readiness for the status strip. */
export function readiness(vehicle) {
  if (!vehicle) return { label: "—", detail: "Waiting for data", ok: true, unknown: true };
  if (vehicle.battery == null && vehicle.locked == null && vehicle.charging == null) {
    return { label: "—", detail: "No vehicle data", ok: true, unknown: true };
  }
  const issues = [];
  if (vehicle.hazard) issues.push("Hazards active");
  if (vehicle.frunk) issues.push("Frunk is open");
  if (vehicle.locked === false) issues.push("Vehicle unlocked");
  if (isNum(vehicle.battery) && vehicle.battery < 20) issues.push("Battery low");
  if (issues.length) return { label: "Check", detail: issues.join(" · "), ok: false };
  return { label: "Ready", detail: "No issues detected", ok: true };
}

/**
 * Alerts for the notification tray.
 * @returns {{ id: string, level: "error"|"warn"|"info", title: string, detail: string }[]}
 */
export function alerts(snapshot, connection = "live") {
  const list = [];
  if (connection === "offline") {
    list.push({ id: "offline", level: "error", title: "Dashboard server unreachable", detail: "Showing the last known state." });
  } else if (snapshot && snapshot.source === "home-assistant" && !snapshot.connected) {
    list.push({ id: "ha", level: "error", title: "Home Assistant disconnected", detail: snapshot.error || "Retrying automatically." });
  }
  if (snapshot?.source === "mock") {
    list.push({ id: "mock", level: "info", title: "Demo mode", detail: "Set HA_URL and HA_TOKEN in .env to use your car." });
  }
  const missing = snapshot?.missingEntities || [];
  if (missing.length) {
    list.push({
      id: "missing",
      level: "warn",
      title: `${missing.length} entit${missing.length === 1 ? "y" : "ies"} not found`,
      detail: missing.map((m) => m.entityId).join(", ")
    });
  }
  const v = snapshot?.vehicle;
  if (v) {
    if (v.frunk) list.push({ id: "frunk", level: "warn", title: "Frunk is open", detail: "Close it by hand before driving." });
    if (v.locked === false) list.push({ id: "unlocked", level: "warn", title: "Vehicle is unlocked", detail: v.location ? `At ${v.location}` : "" });
    if (v.hazard) list.push({ id: "hazard", level: "warn", title: "Hazard lights are on", detail: "" });
    if (isNum(v.battery) && v.battery < 20 && !v.charging) list.push({ id: "battery", level: "warn", title: "Battery low", detail: `${Math.round(v.battery)}% remaining` });
    if (v.updateAvailable) list.push({ id: "update", level: "info", title: "Software update available", detail: v.latestVersion || "" });
  }
  return list;
}

/** Arc/ring geometry helper: clamp a percentage into 0..100. */
export function pct(value) {
  return isNum(value) ? Math.max(0, Math.min(100, value)) : 0;
}
