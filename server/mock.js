/**
 * Demo-mode vehicle simulator. Runs on the server so the browser always renders
 * what the backend reports — the client never fabricates data.
 */

const HOUR_MS = 3_600_000;
const MILES_PER_PCT = 3.21;

function round(n, d = 1) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Deterministic pseudo-random generator so demo history is stable between restarts. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export class MockVehicle {
  constructor({ capacityKwh = 75, latencyMs = 350, now = Date.now() } = {}) {
    this.capacityKwh = capacityKwh;
    this.latencyMs = latencyMs;
    this.state = {
      battery: 72,
      range: null,
      distanceUnit: "mi",
      charging: true,
      chargerConnected: true,
      chargePower: 11.5,
      chargeRate: 32,
      chargeRateUnit: "mi/h",
      chargeLimit: 80,
      chargeLimitMin: 50,
      chargeLimitMax: 100,
      energyAdded: 4.2,
      locked: true,
      climate: false,
      cabinTemp: 64.5,
      targetTemp: 70,
      targetTempMin: null,
      targetTempMax: null,
      outsideTemp: 58,
      tempUnit: "F",
      seatHeatDriver: 0,
      seatHeatPassenger: 0,
      frunk: false,
      defrost: false,
      defrostRear: false,
      sentry: true,
      hazard: false,
      odometer: 18420.4,
      softwareVersion: "2025.32.3",
      latestVersion: "2025.32.3",
      updateAvailable: false,
      location: "Home",
      departureEnabled: false,
      departureTime: "07:30"
    };
    this.series = this.generateHistory(now);
    this.syncDerived();
  }

  syncDerived() {
    const s = this.state;
    s.range = Math.round(s.battery * MILES_PER_PCT);
    if (!s.charging) {
      s.chargePower = 0;
      s.chargeRate = 0;
    } else if (!s.chargePower) {
      s.chargePower = 11.5;
      s.chargeRate = 32;
    }
  }

  /** Snapshot in the same shape `normalizeVehicle` produces. */
  vehicle() {
    return { ...this.state, battery: Math.round(this.state.battery), energyAdded: round(this.state.energyAdded, 2) };
  }

  /** Advance the simulation by `dtMs`. Returns true when visible state changed. */
  tick(dtMs, now = Date.now()) {
    const s = this.state;
    const before = JSON.stringify(this.vehicle());
    const hours = dtMs / HOUR_MS;

    if (s.charging) {
      // Demo runs ~5x real time so progress is visible on screen.
      const pct = ((s.chargePower * hours * 5) / this.capacityKwh) * 100;
      const next = Math.min(s.chargeLimit, s.battery + pct);
      s.energyAdded += ((next - s.battery) / 100) * this.capacityKwh;
      s.battery = next;
      if (s.battery >= s.chargeLimit) s.charging = false;
    }

    const goal = s.climate ? s.targetTemp : s.outsideTemp + 4;
    s.cabinTemp = round(s.cabinTemp + (goal - s.cabinTemp) * Math.min(1, hours * 20), 1);

    this.syncDerived();
    const after = this.vehicle();
    const last = this.series.battery[this.series.battery.length - 1];
    if (!last || last.v !== after.battery) this.series.battery.push({ t: now, v: after.battery });
    return JSON.stringify(after) !== before;
  }

  async apply(command, value) {
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
    const s = this.state;
    switch (command) {
      case "charging":
        if (value && !s.chargerConnected) throw Object.assign(new Error("Charge cable is not connected"), { status: 409 });
        if (value && s.battery >= s.chargeLimit) throw Object.assign(new Error("Battery is already at the charge limit"), { status: 409 });
        s.charging = value;
        if (value) s.energyAdded = 0;
        break;
      case "locked": s.locked = value; break;
      case "frunk":
        if (!value && s.frunk) throw Object.assign(new Error("The frunk must be closed by hand"), { status: 409 });
        s.frunk = value;
        break;
      case "climate": s.climate = value; break;
      case "defrost":
        s.defrost = value;
        if (value) s.climate = true;
        break;
      case "defrostRear": s.defrostRear = value; break;
      case "sentry": s.sentry = value; break;
      case "hazard": s.hazard = value; break;
      case "chargeLimit": s.chargeLimit = value; break;
      case "targetTemp": s.targetTemp = value; break;
      case "seatHeatDriver": s.seatHeatDriver = value; break;
      case "seatHeatPassenger": s.seatHeatPassenger = value; break;
      case "departureEnabled": s.departureEnabled = value; break;
      case "departureTime": s.departureTime = value; break;
      default: throw Object.assign(new Error(`Unsupported command: ${command}`), { status: 400 });
    }
    this.syncDerived();
  }

  /** Seven days of plausible battery/odometer history ending at `now`. */
  generateHistory(now) {
    const rand = seeded(20250213);
    const start = now - 7 * 24 * HOUR_MS;
    const battery = [];
    const odometer = [];
    const charging = [];
    let pct = 80;
    let odo = this.state.odometer - 260;

    for (let t = start; t < now; t += HOUR_MS) {
      const hour = new Date(t).getHours();
      const driving = (hour === 8 || hour === 17 || (hour === 12 && rand() > .6)) && rand() > .15;
      const nightCharge = hour >= 1 && hour <= 5 && pct < 80;

      if (driving) {
        const miles = 6 + rand() * 22;
        odo += miles;
        pct -= miles / MILES_PER_PCT;
        odometer.push({ t: t + 30 * 60_000, v: round(odo, 1) });
      } else if (nightCharge) {
        pct = Math.min(80, pct + 11.5 / this.capacityKwh * 100);
      } else {
        pct -= .05;
      }
      pct = Math.max(12, pct);
      charging.push({ t, v: nightCharge });
      battery.push({ t: t + 40 * 60_000, v: Math.round(pct) });
    }

    odometer.push({ t: now - 60_000, v: this.state.odometer });
    battery.push({ t: now - 30 * 60_000, v: 68 });
    battery.push({ t: now - 60_000, v: Math.round(this.state.battery) });
    charging.push({ t: now - 30 * 60_000, v: true });
    return { battery, odometer, charging };
  }
}
