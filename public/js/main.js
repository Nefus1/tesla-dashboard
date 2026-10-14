import { createActions } from "./actions.js";
import { api, connectLive } from "./api.js";
import { alerts, chargeColor, chargeEta, rangeOf, readiness } from "./derive.js";
import { DASH, escapeHtml, fmtDistance, fmtDuration, fmtNumber, fmtPower, fmtRelative } from "./format.js";
import { icons, renderIcons } from "./icons.js";
import { loadImage } from "./image.js";
import { createStore, effectiveVehicle, reconcilePending } from "./store.js";
import { bindText, toast } from "./ui.js";
import { charging } from "./views/charging.js";
import { climate } from "./views/climate.js";
import { energy } from "./views/energy.js";
import { garage } from "./views/garage.js";
import { home } from "./views/home.js";
import { trip } from "./views/trip.js";

const VIEWS = { home, garage, charging, climate, energy, trip };
const SHORTCUTS = { h: "home", g: "garage", c: "charging", m: "climate", n: "energy", t: "trip" };
const $ = (sel) => document.querySelector(sel);

function routeFromHash() {
  const id = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return VIEWS[id] ? id : "home";
}

const store = createStore({
  config: null,
  snapshot: null,
  history: null,
  historyAt: 0,
  historyError: null,
  activity: [],
  connection: "connecting",
  view: routeFromHash(),
  pending: {},
  image: loadImage(),
  now: Date.now(),
  bootError: null
});
const actions = createActions(store);

// ─── Rendering ────────────────────────────────────────────────────────────────

function connectionLabel(state) {
  if (state.connection === "offline") return { label: "Offline", tone: "is-offline" };
  if (state.connection !== "live") return { label: "Connecting…", tone: "is-offline" };
  if (state.snapshot?.source === "mock") return { label: "Demo", tone: "is-demo" };
  if (state.snapshot && !state.snapshot.connected) return { label: "HA offline", tone: "is-offline" };
  return { label: "Live", tone: "" };
}

function buildContext(state) {
  return {
    state,
    store,
    actions,
    config: state.config,
    snap: state.snapshot,
    v: effectiveVehicle(state, state.now),
    caps: state.config?.capabilities || {},
    now: state.now,
    connectionLabel: connectionLabel(state)
  };
}

function renderShell(ctx) {
  const { v, snap, config, state, now } = ctx;
  const range = rangeOf(v);
  const unit = v?.distanceUnit || "mi";
  const ready = readiness(v);
  const eta = chargeEta(v, config?.vehicle?.batteryCapacityKwh, now);

  bindText(document.body, {
    vehicleName: config?.vehicle?.name || "Model Y",
    locationLine: v?.location || (snap?.source === "mock" ? "Demo vehicle" : "Location unavailable"),
    stripBattery: v ? fmtNumber(v.battery) : DASH,
    stripRange: range != null ? fmtNumber(range) : DASH,
    stripRangeUnit: unit,
    stripRangeSub: v?.range != null ? "Rated range" : range != null ? "Estimated" : "Unavailable",
    stripCharge: !v ? DASH : v.charging ? fmtPower(v.chargePower) : v.chargerConnected ? "Plugged in" : v.charging === false ? "Idle" : DASH,
    stripChargeSub: !v ? "" : v.charging
      ? (eta ? `${fmtDuration(eta.minutes)} to ${v.chargeLimit}%` : "Charging")
      : v.chargerConnected === false ? "Not plugged in" : `Limit ${v.chargeLimit ?? DASH}%`,
    stripReady: ready.label,
    stripReadySub: ready.detail
  });

  const fill = $("#batteryFill");
  fill.style.width = `${Math.max(0, Math.min(100, v?.battery ?? 0))}%`;
  fill.style.background = chargeColor(v);
  $("#statReady").classList.toggle("is-warn", !ready.ok && Boolean(v));

  const pill = $("#connectionPill");
  const label = ctx.connectionLabel;
  pill.textContent = label.label;
  pill.className = `live-dot ${label.tone}`;
  $("#lastUpdated").textContent = snap?.updatedAt ? `Car data ${fmtRelative(snap.updatedAt, now)}` : "";

  document.querySelectorAll(".tab[data-view]").forEach((tab) => {
    const active = tab.dataset.view === state.view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  renderAlerts(alerts(snap, state.connection));
  renderSetupBanner(snap, state.connection);
  document.title = v?.battery != null ? `${config?.vehicle?.name || "Model Y"} · ${Math.round(v.battery)}%` : "Model Y Dashboard";
  document.body.classList.toggle("is-busy", Object.values(state.pending).some((p) => p.inFlight));
}

/** Prominent hint when the backend is reachable but the car isn't wired up correctly. */
function renderSetupBanner(snap, connection) {
  const banner = $("#setupBanner");
  const missing = snap?.missingEntities || [];
  let title = "";
  let body = "";
  if (connection === "live" && snap?.source === "home-assistant" && !snap.connected) {
    title = "Home Assistant is not reachable.";
    body = snap.error || "Check HA_URL and HA_TOKEN in .env. Retrying automatically.";
  } else if (missing.length) {
    title = `${missing.length} configured entit${missing.length === 1 ? "y wasn't" : "ies weren't"} found in Home Assistant.`;
    body = "Check the HA_ENTITY_* ids in .env — /api/entities lists candidates.";
  }
  banner.hidden = !title;
  $("#setupTitle").textContent = title;
  $("#setupBody").textContent = body;
}

function renderAlerts(list) {
  const urgent = list.filter((a) => a.level !== "info").length;
  const badge = $("#alertsBadge");
  badge.hidden = urgent === 0;
  badge.textContent = String(urgent);
  $("#alertsButton").setAttribute("aria-label", urgent ? `Alerts (${urgent})` : "Alerts");

  const html = list.length
    ? list.map((a) => `
        <li class="alert-item is-${a.level}">
          <span class="alert-icon">${a.level === "info" ? icons.info : icons.alert}</span>
          <span><b>${escapeHtml(a.title)}</b>${a.detail ? `<small>${escapeHtml(a.detail)}</small>` : ""}</span>
        </li>`).join("")
    : '<li class="empty-state">All clear — no alerts.</li>';
  const panel = $("#alertsList");
  if (panel.dataset.html !== html) {
    panel.innerHTML = html;
    panel.dataset.html = html;
  }
}

let mounted = { id: null, root: null };

function render(state) {
  const ctx = buildContext(state);
  renderShell(ctx);

  const container = $("#view");
  if (!state.config || !state.snapshot?.vehicle) {
    container.setAttribute("aria-busy", "true");
    if (state.bootError) {
      container.innerHTML = `<section class="panel boot-error"><h2>Can't reach the dashboard server</h2><p>${escapeHtml(state.bootError)}</p><p class="schedule-note">Retrying automatically…</p></section>`;
      mounted = { id: null, root: null };
    }
    return;
  }

  if (mounted.id !== state.view) {
    const root = document.createElement("div");
    root.className = `view view-${state.view}`;
    const view = VIEWS[state.view];
    view.mount(root, ctx);
    renderIcons(root);
    container.replaceChildren(root);
    container.removeAttribute("aria-busy");
    mounted = { id: state.view, root };
  }
  VIEWS[mounted.id].update(mounted.root, ctx);
  renderIcons(mounted.root);
}

store.subscribe(render);

// ─── Navigation, global events ────────────────────────────────────────────────

function navigate(view) {
  if (!VIEWS[view]) return;
  if (location.hash !== `#/${view}`) location.hash = `#/${view}`;
  else store.set({ view });
}

window.addEventListener("hashchange", () => {
  store.set({ view: routeFromHash() });
  window.scrollTo({ top: 0, behavior: "instant" });
});

document.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle]");
  if (toggle) {
    event.preventDefault();
    actions.toggle(toggle.dataset.toggle);
    return;
  }
  if (event.target.closest("#refreshButton")) return void actions.refresh();

  const alertsButton = event.target.closest("#alertsButton");
  const panel = $("#alertsPanel");
  if (alertsButton) {
    panel.hidden = !panel.hidden;
    alertsButton.setAttribute("aria-expanded", String(!panel.hidden));
    return;
  }
  if (!panel.hidden && !event.target.closest("#alertsPanel")) {
    panel.hidden = true;
    $("#alertsButton").setAttribute("aria-expanded", "false");
  }
});

// Arrow-key navigation between tabs (WAI-ARIA tabs pattern).
$(".tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...document.querySelectorAll(".tab[data-view]")];
  const index = tabs.indexOf(document.activeElement);
  if (index === -1) return;
  event.preventDefault();
  let next = index;
  if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = tabs.length - 1;
  tabs[next].focus();
  navigate(tabs[next].dataset.view);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#alertsPanel").hidden) {
    $("#alertsPanel").hidden = true;
    $("#alertsButton").setAttribute("aria-expanded", "false");
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest("input, textarea, select, [contenteditable], dialog[open]")) return;
  const key = event.key.toLowerCase();
  if (SHORTCUTS[key]) return navigate(SHORTCUTS[key]);
  if (key === "l") return void actions.toggle("locked");
  if (key === "s") return void actions.toggle("sentry");
  if (key === "r") return void actions.refresh();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function loadConfig() {
  try {
    const [config, snapshot] = await Promise.all([api.config(), api.state()]);
    store.set((s) => ({ config, snapshot: s.snapshot || snapshot, bootError: null }));
  } catch (error) {
    store.set({ bootError: error.message });
    setTimeout(loadConfig, 5000);
  }
}

renderIcons(document);
loadConfig();

connectLive({
  onState: (snapshot) => store.set((s) => ({ snapshot, pending: reconcilePending(s.pending, snapshot.vehicle) })),
  onActivity: (item) => store.set((s) => ({ activity: [item, ...s.activity.filter((a) => a.id !== item.id)].slice(0, 50) })),
  onActivityLog: (items) => store.set({ activity: Array.isArray(items) ? items : [] }),
  onConnection: (connection) => {
    const prev = store.get().connection;
    store.set({ connection });
    if (prev === "offline" && connection === "live") toast("Reconnected", "success");
  }
});

// Relative timestamps + optimistic-value expiry.
setInterval(() => store.set((s) => ({ now: Date.now(), pending: reconcilePending(s.pending, s.snapshot?.vehicle) })), 15_000);
// History refresh.
setInterval(() => actions.loadHistory(), 5 * 60_000);
