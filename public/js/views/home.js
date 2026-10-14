import { chargeColor, chargeEta, pct, rangeOf, readiness } from "../derive.js";
import { DASH, fmtDistance, fmtDuration, fmtEnergy, fmtNumber, fmtPercent, fmtPower, fmtTemp, fmtTimeOfDay, hourLabel } from "../format.js";
import { bindText } from "../ui.js";
import {
  bindChargeLimit, bindVehicleImages, chargeLimitPanel, quickTiles, renderActivity, renderBars,
  updateChargeLimit, updateToggles, updateVehicleImages
} from "./shared.js";

function ticks() {
  const cx = 210, cy = 221, radius = 168;
  let markup = "";
  for (let i = 0; i <= 10; i++) {
    const angle = (220 + i * 28) * Math.PI / 180;
    const inner = i % 5 === 0 ? radius - 16 : radius - 10;
    const p = (r) => [(cx + Math.cos(angle) * r).toFixed(1), (cy + Math.sin(angle) * r).toFixed(1)];
    const [x1, y1] = p(radius + 1);
    const [x2, y2] = p(inner);
    markup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
  }
  return markup;
}

export const home = {
  id: "home",
  title: "Home",

  mount(root, ctx) {
    root.innerHTML = `
<section class="dashboard-grid">
  <aside class="panel status-panel">
    <div class="panel-heading">
      <div><p class="eyebrow">Vehicle</p><h2>Status</h2></div>
      <span class="live-dot" data-home-pill>Live</span>
    </div>

    <div class="hero-metric">
      <div><span data-bind="battery">${DASH}</span><small>%</small></div>
      <svg class="bolt" data-home-bolt viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z"/></svg>
    </div>
    <p class="range-line"><span data-bind="range">${DASH}</span> remaining</p>

    <div class="progress-row">
      <span>Charge limit</span>
      <a class="link-button" href="#/charging" data-bind="limit">${DASH}</a>
    </div>

    <div class="entity-list">
      <button class="entity-row" type="button" data-toggle="locked" role="switch">
        <span class="row-icon" data-icon="lock" data-toggle-icon></span>
        <span><b data-bind="lockLabel">${DASH}</b><small data-bind="lockSub"></small></span>
        <span class="chevron"></span>
      </button>
      <button class="entity-row" type="button" data-toggle="climate" role="switch">
        <span class="row-icon" data-icon="fan"></span>
        <span><b data-bind="climateLabel">${DASH}</b><small data-bind="climateSub"></small></span>
        <span class="chevron"></span>
      </button>
      <button class="entity-row" type="button" data-toggle="charging" role="switch">
        <span class="row-icon" data-icon="bolt"></span>
        <span><b data-bind="chargingLabel">${DASH}</b><small data-bind="chargingSub"></small></span>
        <span class="chevron"></span>
      </button>
      <a class="entity-row" href="#/garage">
        <span class="row-icon" data-icon="check" data-home-ready-icon></span>
        <span><b data-bind="readyLabel">${DASH}</b><small data-bind="readySub"></small></span>
        <span class="chevron"></span>
      </a>
    </div>
  </aside>

  <section class="panel car-panel" aria-label="Vehicle charge visualization">
    <div class="car-stage">
      <svg class="charge-arc" viewBox="0 0 420 420" aria-hidden="true">
        <path class="arc-track" d="M68 321a168 168 0 1 1 284 0"></path>
        <path class="arc-fill" data-arc pathLength="100" d="M68 321a168 168 0 1 1 284 0"></path>
        <path class="arc-limit" data-arc-limit pathLength="100" d="M68 321a168 168 0 1 1 284 0"></path>
        <g class="arc-ticks">${ticks()}</g>
      </svg>
      <div class="car-wrap">
        <img class="vehicle-image" data-vehicle-image alt="Your vehicle" width="400" height="600">
      </div>
      <div class="arc-label top"><b data-bind="arcBattery">${DASH}</b><span>Battery</span></div>
      <div class="arc-label left"><b data-bind="arcRange">${DASH}</b><span>Range</span></div>
      <div class="arc-label right"><b data-bind="arcLimit">${DASH}</b><span>Limit</span></div>
      <div class="plug-line" data-plug-line></div>
    </div>
    <div class="primary-action-row">
      <button class="command-button" type="button" data-toggle="charging">
        <span data-toggle-label>Start charging</span>
      </button>
      <a class="command-button secondary" href="#/charging" data-bind="departureButton">Schedule departure</a>
    </div>
  </section>

  <aside class="right-column">
    <section class="panel controls-panel">
      <div class="panel-heading">
        <div><p class="eyebrow">Controls</p><h2>Quick actions</h2></div>
      </div>
      <div class="control-grid">${quickTiles()}</div>
    </section>

    ${chargeLimitPanel()}

    <section class="panel energy-panel">
      <div class="panel-heading">
        <div><p class="eyebrow">Energy · 24 h</p><h2 data-bind="energyUsed">${DASH}</h2></div>
        <a class="link-button" href="#/energy">Details</a>
      </div>
      <div class="bar-chart" data-energy-chart aria-label="Hourly energy use over the last 24 hours" role="img"></div>
      <p class="chart-note" data-bind="energyNote"></p>
    </section>
  </aside>
</section>

<section class="panel activity-panel">
  <div class="panel-heading">
    <div><p class="eyebrow">Recent activity</p><h2>Timeline</h2></div>
  </div>
  <div class="activity-list" data-activity></div>
</section>`;
    bindChargeLimit(root, ctx.actions);
    bindVehicleImages(root);
    ctx.actions.loadHistory();
  },

  update(root, ctx) {
    const { v, state, config, now } = ctx;
    const range = rangeOf(v);
    const unit = v?.distanceUnit || "mi";
    const ready = readiness(v);
    const eta = chargeEta(v, config?.vehicle?.batteryCapacityKwh, now);

    const chargingSub = !v ? "" : v.charging
      ? [fmtPower(v.chargePower), eta ? `${fmtDuration(eta.minutes)} to ${v.chargeLimit}%` : null].filter((x) => x && x !== DASH).join(" · ")
      : v.chargerConnected ? "Plugged in" : v.chargerConnected === false ? "Not plugged in" : "";

    bindText(root, {
      battery: v ? fmtNumber(v.battery) : DASH,
      range: fmtDistance(range, unit),
      limit: fmtPercent(v?.chargeLimit),
      lockLabel: !v || v.locked === null ? "Lock unknown" : v.locked ? "Locked" : "Unlocked",
      lockSub: v?.sentry ? "Sentry Mode on" : v?.locked === false ? "Tap to lock" : "",
      climateLabel: v?.climate == null ? "Climate unknown" : v.climate ? `Climate on · ${fmtTemp(v.targetTemp, v.tempUnit)}` : "Climate off",
      climateSub: v?.cabinTemp != null ? `Inside ${fmtTemp(v.cabinTemp, v.tempUnit)}${v.outsideTemp != null ? ` · Outside ${fmtTemp(v.outsideTemp, v.tempUnit)}` : ""}` : "",
      chargingLabel: !v || v.charging === null ? "Charging unknown" : v.charging ? "Charging" : "Not charging",
      chargingSub,
      readyLabel: ready.unknown ? "Status unknown" : ready.label === "Ready" ? "Ready to go" : "Needs attention",
      readySub: ready.detail,
      arcBattery: fmtPercent(v?.battery),
      arcRange: fmtDistance(range, unit),
      arcLimit: fmtPercent(v?.chargeLimit),
      departureButton: v?.departureEnabled ? `Departure ${fmtTimeOfDay(v.departureTime)}` : "Schedule departure"
    });

    const color = chargeColor(v);
    const arc = root.querySelector("[data-arc]");
    arc.style.strokeDasharray = `${pct(v?.battery)} 100`;
    arc.style.stroke = color;
    const limitArc = root.querySelector("[data-arc-limit]");
    const limit = pct(v?.chargeLimit);
    limitArc.style.strokeDasharray = `0.6 100`;
    limitArc.style.strokeDashoffset = `${-Math.max(0, limit - 0.3)}`;
    limitArc.style.opacity = v?.chargeLimit != null ? "1" : "0";

    root.querySelector("[data-home-bolt]").classList.toggle("is-off", !v?.charging);
    root.querySelector("[data-plug-line]").classList.toggle("is-off", !v?.chargerConnected);
    root.querySelector("[data-home-ready-icon]").classList.toggle("is-warn", !ready.ok);

    const pill = root.querySelector("[data-home-pill]");
    const live = ctx.connectionLabel;
    pill.textContent = live.label;
    pill.className = `live-dot ${live.tone}`;

    // Energy (from history)
    const history = state.history;
    const usage = history?.usage24h || [];
    renderBars(root.querySelector("[data-energy-chart]"), usage.map((h) => h.kWh), {
      titles: usage.map((h) => `${hourLabel(h.hour)}: ${h.kWh} kWh`)
    });
    bindText(root, {
      energyUsed: history?.available.battery ? `${fmtEnergy(history.totals.usedKwh24h)} used` : state.historyError ? "Unavailable" : DASH,
      energyNote: history && !history.available.battery ? "Needs battery history in Home Assistant" : ""
    });

    updateToggles(root, ctx);
    updateChargeLimit(root, ctx);
    updateVehicleImages(root, state.image);
    renderActivity(root.querySelector("[data-activity]"), state.activity, { limit: 5, now });
  }
};
