/** User intents → optimistic store updates → backend commands (with rollback). */
import { api } from "./api.js";
import { effectiveVehicle, reconcilePending, settledPending } from "./store.js";
import { confirmAction, toast } from "./ui.js";
import { SEAT_LEVELS, fmtTemp, fmtTimeOfDay } from "./format.js";

export const LABELS = {
  charging: "Charging",
  locked: "Lock",
  frunk: "Frunk",
  climate: "Climate",
  defrost: "Front defrost",
  defrostRear: "Rear defrost",
  sentry: "Sentry Mode",
  hazard: "Hazard lights",
  departureEnabled: "Scheduled departure",
  chargeLimit: "Charge limit",
  targetTemp: "Target temperature",
  seatHeatDriver: "Driver seat heat",
  seatHeatPassenger: "Passenger seat heat",
  departureTime: "Departure time"
};

export function tempBounds(vehicle) {
  if (vehicle?.targetTempMin != null && vehicle?.targetTempMax != null) return [vehicle.targetTempMin, vehicle.targetTempMax];
  return vehicle?.tempUnit === "C" ? [15, 28] : [59, 82];
}

export function createActions(store) {
  const caps = () => store.get().config?.capabilities || {};
  const vehicle = () => effectiveVehicle(store.get());
  let tempTimer = null;

  const setPending = (key, entry) => store.set((s) => ({ pending: { ...s.pending, [key]: entry } }));
  const clearPending = (key) => store.set((s) => {
    const pending = { ...s.pending };
    delete pending[key];
    return { pending };
  });

  /** Send one command. Returns true on success. */
  async function send(key, value, { success } = {}) {
    if (store.get().pending[key]?.inFlight) return false;
    if (!caps()[key]) {
      toast(`${LABELS[key]} isn't configured — map its entity in .env`, "error");
      return false;
    }
    setPending(key, { value, inFlight: true });
    try {
      const res = await api.command(key, value);
      store.set((s) => {
        const pending = { ...s.pending, [key]: settledPending(res.value) };
        return { snapshot: res.state, pending: reconcilePending(pending, res.state?.vehicle) };
      });
      if (success) toast(success, "success");
      return true;
    } catch (error) {
      clearPending(key);
      toast(error.message || `${LABELS[key]} failed`, "error");
      return false;
    }
  }

  async function toggle(key) {
    const v = vehicle();
    if (!v) return;
    const current = v[key];
    if (!caps()[key]) return toast(`${LABELS[key]} isn't configured — map its entity in .env`, "error");
    if (current === null || current === undefined) return toast(`${LABELS[key]} state is unavailable right now`, "error");

    if (key === "frunk") {
      if (current) return toast("The frunk closes by hand", "info");
      const ok = await confirmAction({ title: "Open the frunk?", body: "Make sure nothing is in front of the vehicle.", confirmLabel: "Open frunk" });
      if (ok) send("frunk", true, { success: "Frunk opened" });
      return;
    }

    if (key === "locked" && current !== false) {
      const ok = await confirmAction({ title: "Unlock the vehicle?", body: "Doors will unlock remotely.", confirmLabel: "Unlock", danger: true });
      if (!ok) return;
      return send("locked", false, { success: "Vehicle unlocked" });
    }

    const next = !current;
    const messages = {
      locked: "Vehicle locked",
      charging: next ? "Charging started" : "Charging stopped",
      climate: next ? "Climate on" : "Climate off",
      defrost: next ? "Front defrost on" : "Front defrost off",
      defrostRear: next ? "Rear defrost on" : "Rear defrost off",
      sentry: next ? "Sentry Mode on" : "Sentry Mode off",
      hazard: next ? "Hazard lights on" : "Hazard lights off",
      departureEnabled: next ? "Scheduled departure on" : "Scheduled departure off"
    };
    return send(key, next, { success: messages[key] });
  }

  function setChargeLimit(limit) {
    return send("chargeLimit", limit, { success: `Charge limit set to ${limit}%` });
  }

  /** +/- buttons: update immediately, send once the user stops tapping. */
  function adjustTemp(direction) {
    const v = vehicle();
    if (!v || v.targetTemp == null) return;
    const step = v.tempUnit === "C" ? 0.5 : 1;
    const [min, max] = tempBounds(v);
    const value = Math.min(max, Math.max(min, Math.round((v.targetTemp + direction * step) * 2) / 2));
    if (value === v.targetTemp) return;
    setPending("targetTemp", { value, inFlight: false, until: Date.now() + 60_000 });
    clearTimeout(tempTimer);
    tempTimer = setTimeout(() => send("targetTemp", value, { success: `Target ${fmtTemp(value, v.tempUnit)}` }), 600);
  }

  function setSeat(key, level) {
    const side = key === "seatHeatDriver" ? "Driver" : "Passenger";
    return send(key, level, { success: `${side} seat heat: ${SEAT_LEVELS[level]}` });
  }

  function setDepartureTime(time) {
    return send("departureTime", time, { success: `Departure set for ${fmtTimeOfDay(time)}` });
  }

  async function resetTrip() {
    const ok = await confirmAction({ title: "Reset Trip A?", body: "Trip A will start counting from the current odometer reading.", confirmLabel: "Reset" });
    if (!ok) return;
    try {
      store.set({ snapshot: await api.resetTrip() });
      toast("Trip A reset", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function refresh() {
    try {
      store.set({ snapshot: await api.refresh() });
      loadHistory(true);
      toast("Vehicle data refreshed", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function loadHistory(force = false) {
    const s = store.get();
    if (!force && s.historyAt && Date.now() - s.historyAt < 5 * 60_000) return;
    store.set({ historyAt: Date.now() });
    try {
      store.set({ history: await api.history(), historyError: null });
    } catch (error) {
      store.set({ historyError: error.message, historyAt: 0 });
    }
  }

  return { send, toggle, setChargeLimit, adjustTemp, setSeat, setDepartureTime, resetTrip, refresh, loadHistory };
}
