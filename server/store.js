import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { normalizeVehicle, latestUpdate } from "./normalize.js";

const ACTIVITY_LIMIT = 50;

/** Activity entries derived from a change between two vehicle snapshots. */
export function diffActivity(prev, next) {
  if (!prev) return [];
  const items = [];
  const changed = (key) => prev[key] !== null && next[key] !== null && prev[key] !== next[key];
  const pct = next.battery === null ? "" : `${Math.round(next.battery)}%`;

  if (changed("locked")) items.push(next.locked
    ? { title: "Vehicle locked", detail: next.sentry ? "Sentry enabled" : "", icon: "lock" }
    : { title: "Vehicle unlocked", detail: next.location || "", icon: "unlock" });
  if (changed("charging")) items.push(next.charging
    ? { title: "Charging started", detail: pct, icon: "bolt" }
    : { title: "Charging stopped", detail: pct, icon: "bolt" });
  if (changed("chargerConnected")) items.push({ title: next.chargerConnected ? "Charge cable connected" : "Charge cable disconnected", detail: pct, icon: "plug" });
  if (changed("climate")) items.push({ title: next.climate ? "Climate turned on" : "Climate turned off", detail: next.climate && next.targetTemp !== null ? `Target ${next.targetTemp}°${next.tempUnit}` : "", icon: "fan" });
  if (changed("frunk")) items.push({ title: next.frunk ? "Frunk opened" : "Frunk closed", detail: "", icon: "frunk" });
  if (changed("sentry")) items.push({ title: next.sentry ? "Sentry Mode enabled" : "Sentry Mode disabled", detail: "", icon: "sentry" });
  if (changed("defrost")) items.push({ title: next.defrost ? "Front defrost on" : "Front defrost off", detail: "", icon: "defrost" });
  if (changed("defrostRear")) items.push({ title: next.defrostRear ? "Rear defrost on" : "Rear defrost off", detail: "", icon: "defrost" });
  if (changed("hazard")) items.push({ title: next.hazard ? "Hazard lights on" : "Hazard lights off", detail: "", icon: "hazard" });
  if (changed("chargeLimit")) items.push({ title: "Charge limit changed", detail: `${next.chargeLimit}% target`, icon: "bolt" });
  if (changed("location")) items.push(next.location === "Away"
    ? { title: `Left ${prev.location}`, detail: "", icon: "trip" }
    : { title: `Arrived at ${next.location}`, detail: "", icon: "trip" });
  if (changed("updateAvailable") && next.updateAvailable) items.push({ title: "Software update available", detail: next.latestVersion || "", icon: "info" });
  if (changed("softwareVersion")) items.push({ title: "Software updated", detail: next.softwareVersion, icon: "check" });
  if (changed("departureEnabled")) items.push({ title: next.departureEnabled ? "Scheduled departure on" : "Scheduled departure off", detail: next.departureEnabled ? next.departureTime || "" : "", icon: "clock" });

  return items;
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * Holds the current vehicle state and activity log. Emits:
 *   "state"    (snapshot) whenever the normalized vehicle changes
 *   "activity" (item)     for each derived activity entry
 */
export class VehicleStore extends EventEmitter {
  constructor(config, logger, { persist = true } = {}) {
    super();
    this.config = config;
    this.log = logger;
    this.persist = persist;
    this.entities = new Map();
    this.vehicle = null;
    this.updatedAt = null;
    this.loaded = false;
    this.connection = { connected: false, transport: config.mock ? "mock" : "none", error: null };
    this.settingsFile = path.join(config.dataDir, "settings.json");
    this.activityFile = path.join(config.dataDir, "activity.json");
    this.settings = persist ? readJsonFile(this.settingsFile, {}) : {};
    this.activity = persist ? readJsonFile(this.activityFile, []) : [];
    if (!Array.isArray(this.activity)) this.activity = [];
    this.saveTimer = null;
    this.activitySeq = Date.now();
  }

  get source() {
    return this.config.mock ? "mock" : "home-assistant";
  }

  entityByKey(key) {
    const id = this.config.entities[key];
    return id ? this.entities.get(id) : undefined;
  }

  // ─── Home Assistant input ──────────────────────────────────────────────────

  setStates(list) {
    const wanted = new Set(Object.values(this.config.entities).filter(Boolean));
    this.entities.clear();
    for (const entity of list) {
      if (wanted.has(entity.entity_id)) this.entities.set(entity.entity_id, entity);
    }
    this.loaded = true;
    this.recompute();
  }

  updateEntity(entity) {
    const wanted = Object.values(this.config.entities).includes(entity.entity_id);
    if (!wanted) return;
    this.entities.set(entity.entity_id, entity);
    this.recompute();
  }

  recompute() {
    const vehicle = normalizeVehicle((key) => this.entityByKey(key), { tempUnit: this.config.tempUnit });
    this.applyVehicle(vehicle, latestUpdate(this.entities.values()));
  }

  // ─── Shared path (HA and mock) ─────────────────────────────────────────────

  applyVehicle(vehicle, updatedAt = new Date().toISOString()) {
    const prev = this.vehicle;
    const changed = !prev || JSON.stringify(prev) !== JSON.stringify(vehicle);
    this.vehicle = vehicle;
    this.updatedAt = updatedAt || this.updatedAt;
    this.loaded = true;
    if (!changed) return;
    for (const item of diffActivity(prev, vehicle)) this.addActivity(item);
    this.emit("state", this.snapshot());
  }

  setConnection(status) {
    const prev = this.connection;
    this.connection = { ...prev, ...status };
    if (prev.connected !== this.connection.connected || prev.transport !== this.connection.transport) {
      this.emit("state", this.snapshot());
    }
  }

  addActivity({ title, detail = "", icon = "check" }) {
    const item = { id: String(++this.activitySeq), at: new Date().toISOString(), title, detail, icon };
    this.activity.unshift(item);
    this.activity.length = Math.min(this.activity.length, ACTIVITY_LIMIT);
    this.emit("activity", item);
    this.scheduleSave();
    return item;
  }

  // ─── Settings ───────────────────────────────────────────────────────────────

  resetTrip() {
    const odometer = this.vehicle?.odometer;
    if (odometer === null || odometer === undefined) return null;
    this.settings.tripBaseline = odometer;
    this.settings.tripResetAt = new Date().toISOString();
    this.scheduleSave();
    this.addActivity({ title: "Trip A reset", detail: `${odometer.toLocaleString("en-US")} ${this.vehicle.distanceUnit}`, icon: "trip" });
    this.emit("state", this.snapshot());
    return this.settings.tripBaseline;
  }

  scheduleSave() {
    if (!this.persist) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 500);
  }

  flush() {
    if (!this.persist) return;
    clearTimeout(this.saveTimer);
    try {
      writeJsonFile(this.settingsFile, this.settings);
      writeJsonFile(this.activityFile, this.activity);
    } catch (error) {
      this.log.warn(`Could not persist dashboard data: ${error.message}`);
    }
  }

  // ─── Output ─────────────────────────────────────────────────────────────────

  missingEntities() {
    if (this.config.mock || !this.loaded) return [];
    return Object.entries(this.config.entities)
      .filter(([, id]) => id && !this.entities.has(id))
      .map(([key, entityId]) => ({ key, entityId }));
  }

  snapshot() {
    const v = this.vehicle;
    const baseline = this.settings.tripBaseline;
    const tripA = v && v.odometer !== null && Number.isFinite(baseline) && v.odometer >= baseline
      ? Math.round((v.odometer - baseline) * 10) / 10
      : null;

    return {
      source: this.source,
      connected: this.config.mock ? true : this.connection.connected,
      transport: this.connection.transport,
      error: this.connection.error || null,
      loaded: this.loaded,
      updatedAt: this.updatedAt,
      serverTime: new Date().toISOString(),
      vehicle: v ? {
        ...v,
        tripA,
        tripResetAt: this.settings.tripResetAt || null,
        name: this.config.vehicle.name,
        model: this.config.vehicle.model,
        color: this.config.vehicle.color
      } : null,
      missingEntities: this.missingEntities()
    };
  }
}
