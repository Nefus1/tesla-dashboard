/** Formatting helpers. Pure — safe to import from Node tests. */

export const DASH = "—";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function fmtNumber(value, decimals = 0) {
  if (!isNum(value)) return DASH;
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** "72" — temperature without unit, rounded to 0.5 when needed. */
export function fmtTempValue(value) {
  if (!isNum(value)) return DASH;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function fmtTemp(value, unit = "F") {
  return isNum(value) ? `${fmtTempValue(value)}°${unit}` : DASH;
}

export function fmtDistance(value, unit = "mi", decimals = 0) {
  return isNum(value) ? `${fmtNumber(value, decimals)} ${unit}` : DASH;
}

export function fmtPower(kw) {
  if (!isNum(kw)) return DASH;
  return `${kw >= 10 ? Math.round(kw) : kw.toFixed(1)} kW`;
}

export function fmtEnergy(kwh, decimals = 1) {
  return isNum(kwh) ? `${fmtNumber(kwh, decimals)} kWh` : DASH;
}

export function fmtCurrency(amount, currency = "USD") {
  if (!isNum(amount)) return DASH;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function fmtPercent(value) {
  return isNum(value) ? `${Math.round(value)}%` : DASH;
}

export function fmtClock(date) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

/** "07:30" → "7:30 AM" */
export function fmtTimeOfDay(hhmm) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ""));
  if (!match) return DASH;
  const d = new Date(2000, 0, 1, Number(match[1]), Number(match[2]));
  return fmtClock(d);
}

export function fmtDuration(minutes) {
  if (!isNum(minutes) || minutes < 0) return DASH;
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** Relative time: "just now", "42s ago", "5 min ago", "3 h ago", "Yesterday 5:30 PM", "Oct 3". */
export function fmtRelative(iso, now = Date.now()) {
  const t = typeof iso === "number" ? iso : Date.parse(iso || "");
  if (!Number.isFinite(t)) return DASH;
  const diff = Math.max(0, now - t) / 1000;
  if (diff < 10) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  const date = new Date(t);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (t >= today.getTime()) return diff < 6 * 3600 ? `${Math.floor(diff / 3600)} h ago` : fmtClock(date);
  if (t >= today.getTime() - 86_400_000) return `Yesterday ${fmtClock(date)}`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

export function hourLabel(hour) {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

export const SEAT_LEVELS = ["Off", "Low", "Med", "High"];
