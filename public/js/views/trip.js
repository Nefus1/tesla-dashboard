import { rangeOf } from "../derive.js";
import { DASH, escapeHtml, fmtDistance, fmtNumber, fmtRelative } from "../format.js";
import { bindText } from "../ui.js";

export const trip = {
  id: "trip",
  title: "Trip",

  mount(root, ctx) {
    root.innerHTML = `
<div class="view-grid view-trip-grid">
  <section class="panel trip-stats-panel">
    <div class="panel-heading">
      <div><p class="eyebrow">Vehicle</p><h2>Odometer</h2></div>
    </div>
    <div class="odometer-display">
      <span data-bind="odometer">${DASH}</span><small data-bind="unit">mi</small>
    </div>

    <div class="trip-meters">
      <div class="trip-meter-row">
        <div>
          <span class="trip-meter-label">Trip A</span>
          <b class="trip-meter-val" data-bind="tripA">${DASH}</b>
          <small class="trip-meter-sub" data-bind="tripSince"></small>
        </div>
        <button class="link-button" type="button" data-reset-trip>Reset</button>
      </div>
      <div class="trip-meter-row">
        <div>
          <span class="trip-meter-label">Estimated range</span>
          <b class="trip-meter-val" data-bind="range">${DASH}</b>
        </div>
        <span class="stat-sub" data-bind="battery"></span>
      </div>
      <div class="trip-meter-row">
        <div>
          <span class="trip-meter-label">Last 7 days</span>
          <b class="trip-meter-val" data-bind="week">${DASH}</b>
        </div>
        <span class="stat-sub" data-bind="efficiency"></span>
      </div>
    </div>
  </section>

  <section class="panel trip-history-panel">
    <div class="panel-heading">
      <div><p class="eyebrow">Recent</p><h2>Distance by day</h2></div>
    </div>
    <div class="trip-list" data-days></div>
    <p class="chart-note" data-bind="note"></p>
  </section>
</div>`;

    root.querySelector("[data-reset-trip]").addEventListener("click", () => ctx.actions.resetTrip());
    ctx.actions.loadHistory();
  },

  update(root, ctx) {
    const { v, state, now } = ctx;
    const unit = v?.distanceUnit || "mi";
    const h = state.history;

    bindText(root, {
      odometer: v?.odometer != null ? fmtNumber(v.odometer, 1) : DASH,
      unit,
      tripA: v?.tripA != null ? fmtDistance(v.tripA, unit, 1) : v?.odometer != null ? "Not started" : DASH,
      tripSince: v?.tripResetAt ? `Since ${fmtRelative(v.tripResetAt, now)}` : "",
      range: fmtDistance(rangeOf(v), unit),
      battery: v?.battery != null ? `${Math.round(v.battery)}% battery` : "",
      week: h ? fmtDistance(h.totals.distance, unit, 1) : DASH,
      efficiency: h?.totals.efficiency != null ? `${fmtNumber(h.totals.efficiency)} Wh/${unit}` : "",
      note: state.historyError ? `History unavailable: ${state.historyError}`
        : h && !h.available.odometer ? "No odometer history recorded in Home Assistant yet." : ""
    });

    root.querySelector("[data-reset-trip]").disabled = v?.odometer == null;

    const days = (h?.distance || []).slice().reverse();
    const max = Math.max(1, ...days.map((d) => d.distance));
    const html = days.length ? days.map((d, i) => `
      <div class="trip-item">
        <span class="trip-date-badge">${i === 0 ? "Today" : i === 1 ? "Yesterday" : escapeHtml(d.label)}</span>
        <div class="trip-details">
          <b>${d.distance > 0 ? fmtDistance(d.distance, unit, 1) : "Parked"}</b>
          <div class="energy-bar-track"><div class="energy-bar-fill is-used" style="width:${(d.distance / max) * 100}%"></div></div>
        </div>
      </div>`).join("") : '<p class="empty-state">No odometer history yet.</p>';
    const list = root.querySelector("[data-days]");
    if (list.dataset.html !== html) {
      list.innerHTML = html;
      list.dataset.html = html;
    }
  }
};
