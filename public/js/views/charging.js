import { chargeColor, chargeEta, pct, rangeOf } from "../derive.js";
import { DASH, fmtClock, fmtCurrency, fmtDistance, fmtDuration, fmtEnergy, fmtNumber, fmtPower } from "../format.js";
import { bindText } from "../ui.js";
import { bindChargeLimit, chargeLimitPanel, renderBars, updateChargeLimit, updateToggles } from "./shared.js";

const RING = 2 * Math.PI * 66; // circumference for r=66

export const charging = {
  id: "charging",
  title: "Charging",

  mount(root, ctx) {
    root.innerHTML = `
<div class="view-grid view-charging-grid">
  <section class="panel charging-status-panel">
    <div class="panel-heading">
      <div><p class="eyebrow">Charging</p><h2 data-bind="title">${DASH}</h2></div>
      <span class="live-dot" data-charge-pill>${DASH}</span>
    </div>

    <div class="charging-hero">
      <div class="charge-ring-wrap">
        <svg class="charge-ring-svg" viewBox="0 0 160 160" aria-hidden="true">
          <circle class="ring-track" cx="80" cy="80" r="66" fill="none" stroke-width="10"/>
          <circle class="ring-fill" data-ring cx="80" cy="80" r="66" fill="none" stroke-width="10" stroke-dasharray="0 ${RING}"/>
          <circle class="ring-limit-mark" data-ring-limit cx="80" cy="80" r="66" fill="none" stroke-width="12" stroke-dasharray="2.5 ${RING}"/>
        </svg>
        <div class="charge-ring-center">
          <b><span data-bind="battery">${DASH}</span><small>%</small></b>
          <span data-bind="ofLimit"></span>
        </div>
      </div>

      <dl class="charge-live-stats">
        <div class="charge-stat-row"><dt>Power</dt><dd data-bind="power">${DASH}</dd></div>
        <div class="charge-stat-row"><dt>Rate</dt><dd data-bind="rate">${DASH}</dd></div>
        <div class="charge-stat-row"><dt>Range</dt><dd data-bind="range">${DASH}</dd></div>
        <div class="charge-stat-row"><dt>Time to limit</dt><dd data-bind="eta">${DASH}</dd></div>
        <div class="charge-stat-row"><dt>Added this session</dt><dd data-bind="added">${DASH}</dd></div>
        <div class="charge-stat-row"><dt>Session cost</dt><dd data-bind="cost">${DASH}</dd></div>
      </dl>
    </div>

    <div class="charging-action-row">
      <button class="command-button" type="button" data-toggle="charging"><span data-toggle-label>Start charging</span></button>
    </div>
  </section>

  <div class="charging-right-col">
    ${chargeLimitPanel("Settings")}

    <section class="panel schedule-panel">
      <div class="panel-heading">
        <div><p class="eyebrow">Schedule</p><h2>Departure</h2></div>
        <button class="toggle-switch" type="button" role="switch" data-toggle="departureEnabled" aria-label="Scheduled departure">
          <span class="toggle-track"></span>
        </button>
      </div>
      <label class="schedule-time-row" data-departure-row>
        <span>Depart at</span>
        <input type="time" data-departure-time value="07:30" step="300">
      </label>
      <p class="schedule-note" data-bind="departureNote">The car finishes charging and preconditions just before you leave.</p>
    </section>
  </div>

  <section class="panel charging-history-panel">
    <div class="panel-heading">
      <div><p class="eyebrow">Last 7 days</p><h2>Charging history</h2></div>
      <span class="stat-sub" data-bind="weekTotal">${DASH}</span>
    </div>
    <div class="history-chart" data-history></div>
    <p class="chart-note" data-bind="historyNote"></p>
  </section>
</div>`;

    bindChargeLimit(root, ctx.actions);
    const time = root.querySelector("[data-departure-time]");
    time.addEventListener("change", () => {
      if (time.value) ctx.actions.setDepartureTime(time.value);
    });
    ctx.actions.loadHistory();
  },

  update(root, ctx) {
    const { v, state, config, caps, now } = ctx;
    const rate = config?.vehicle?.electricityRate ?? 0.15;
    const currency = config?.vehicle?.currency || "USD";
    const eta = chargeEta(v, config?.vehicle?.batteryCapacityKwh, now);
    const atLimit = v && v.battery != null && v.chargeLimit != null && v.battery >= v.chargeLimit;

    let title = DASH;
    if (v) {
      if (v.charging) title = "Charging";
      else if (atLimit && v.chargerConnected) title = "Charge complete";
      else if (v.chargerConnected) title = "Plugged in";
      else if (v.chargerConnected === false) title = "Not plugged in";
      else title = v.charging === false ? "Not charging" : "Status unknown";
    }

    bindText(root, {
      title,
      battery: v ? fmtNumber(v.battery) : DASH,
      ofLimit: v?.chargeLimit != null ? `of ${v.chargeLimit}% limit` : "",
      power: v?.charging ? fmtPower(v.chargePower) : DASH,
      rate: v?.charging && v.chargeRate != null ? `+${fmtNumber(v.chargeRate)} ${v.chargeRateUnit || `${v.distanceUnit}/h`}` : DASH,
      range: fmtDistance(rangeOf(v), v?.distanceUnit),
      eta: eta ? `${fmtDuration(eta.minutes)} · ${fmtClock(eta.at)}` : atLimit ? "Limit reached" : DASH,
      added: fmtEnergy(v?.energyAdded),
      cost: v?.energyAdded != null ? fmtCurrency(v.energyAdded * rate, currency) : DASH
    });

    const pill = root.querySelector("[data-charge-pill]");
    pill.textContent = v?.charging ? "Live" : "Idle";
    pill.className = `live-dot ${v?.charging ? "" : "is-idle"}`;

    const ring = root.querySelector("[data-ring]");
    ring.style.strokeDasharray = `${(pct(v?.battery) / 100) * RING} ${RING}`;
    ring.style.stroke = chargeColor(v);
    const mark = root.querySelector("[data-ring-limit]");
    mark.style.strokeDashoffset = `${-((pct(v?.chargeLimit) / 100) * RING - 1.25)}`;
    mark.style.opacity = v?.chargeLimit != null ? "1" : "0";

    // Departure
    const time = root.querySelector("[data-departure-time]");
    const row = root.querySelector("[data-departure-row]");
    const scheduleAvailable = caps.departureEnabled || caps.departureTime;
    time.disabled = !caps.departureTime || v?.departureEnabled === false;
    row.classList.toggle("is-disabled", time.disabled);
    if (document.activeElement !== time && v?.departureTime) time.value = v.departureTime;
    bindText(root, {
      departureNote: scheduleAvailable
        ? "The car finishes charging and preconditions just before you leave."
        : "Not configured — set HA_ENTITY_DEPARTURE_ENABLED and HA_ENTITY_DEPARTURE_TIME in .env."
    });

    // History
    const days = state.history?.charging || [];
    renderBars(root.querySelector("[data-history]"), days.map((d) => d.kWh), { titles: days.map((d) => `${d.label}: ${d.kWh} kWh`) });
    const chart = root.querySelector("[data-history]");
    if (chart.dataset.labels !== days.map((d) => d.label).join()) {
      chart.dataset.labels = days.map((d) => d.label).join();
      chart.style.setProperty("--cols", String(days.length || 7));
    }
    labelBars(chart, days);
    const totals = state.history?.totals;
    bindText(root, {
      weekTotal: totals ? `${fmtEnergy(totals.chargedKwh)} · ${fmtCurrency(totals.chargedCost, currency)}` : DASH,
      historyNote: state.historyError ? `History unavailable: ${state.historyError}`
        : state.history && !state.history.available.battery ? "No battery history recorded in Home Assistant yet." : ""
    });

    updateToggles(root, ctx);
    updateChargeLimit(root, ctx);
  }
};

/** Day labels and values on the history bars (bars are created by renderBars). */
function labelBars(chart, days) {
  [...chart.children].forEach((bar, i) => {
    const day = days[i];
    if (!day) return;
    bar.dataset.label = day.label;
    bar.dataset.value = day.kWh > 0 ? String(day.kWh) : "";
  });
}
