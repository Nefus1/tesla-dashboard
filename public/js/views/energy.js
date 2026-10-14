import { DASH, escapeHtml, fmtCurrency, fmtEnergy, fmtNumber, hourLabel } from "../format.js";
import { bindText } from "../ui.js";
import { renderBars } from "./shared.js";

export const energy = {
  id: "energy",
  title: "Energy",

  mount(root, ctx) {
    root.innerHTML = `
<div class="view-grid view-energy-grid">
  <section class="panel energy-main-panel">
    <div class="panel-heading">
      <div><p class="eyebrow">Energy</p><h2>Last 24 hours</h2></div>
      <button class="link-button" type="button" data-reload>Reload</button>
    </div>

    <div class="energy-stats-row">
      <div class="energy-stat-box"><span>Used · 24 h</span><b data-bind="used24">${DASH}</b></div>
      <div class="energy-stat-box"><span>Cost · 24 h</span><b data-bind="cost24">${DASH}</b></div>
      <div class="energy-stat-box"><span>Efficiency · 7 d</span><b data-bind="efficiency">${DASH}</b></div>
      <div class="energy-stat-box"><span>Rate</span><b data-bind="rate">${DASH}</b></div>
    </div>

    <div class="energy-chart-large" data-chart role="img" aria-label="Hourly energy use over the last 24 hours"></div>
    <div class="energy-hours" data-hours></div>
    <p class="chart-note" data-bind="note"></p>
  </section>

  <section class="panel energy-breakdown-panel">
    <div class="panel-heading">
      <div><p class="eyebrow">Last 7 days</p><h2>Charged vs used</h2></div>
    </div>
    <div class="energy-category-list" data-days></div>
    <div class="energy-net-box">
      <span>Charged · used</span>
      <b data-bind="week">${DASH}</b>
    </div>
  </section>
</div>`;

    root.querySelector("[data-reload]").addEventListener("click", () => ctx.actions.loadHistory(true));
    ctx.actions.loadHistory();
  },

  update(root, ctx) {
    const { state, config, v } = ctx;
    const h = state.history;
    const currency = h?.currency || config?.vehicle?.currency || "USD";
    const unit = v?.distanceUnit || "mi";
    const usage = h?.usage24h || [];

    renderBars(root.querySelector("[data-chart]"), usage.map((x) => x.kWh), {
      titles: usage.map((x) => `${hourLabel(x.hour)}: ${x.kWh} kWh`)
    });
    const hours = root.querySelector("[data-hours]");
    const hoursHtml = usage.map((x, i) => `<span>${i % 6 === 0 ? hourLabel(x.hour) : ""}</span>`).join("");
    if (hours.dataset.html !== hoursHtml) {
      hours.innerHTML = hoursHtml;
      hours.dataset.html = hoursHtml;
    }

    bindText(root, {
      used24: h ? fmtEnergy(h.totals.usedKwh24h) : DASH,
      cost24: h ? fmtCurrency(h.totals.usedCost24h, currency) : DASH,
      efficiency: h?.totals.efficiency != null ? `${fmtNumber(h.totals.efficiency)} Wh/${unit}` : DASH,
      rate: h ? `${fmtCurrency(h.rate, currency)}/kWh` : DASH,
      week: h ? `${fmtEnergy(h.totals.chargedKwh)} · ${fmtEnergy(h.totals.usedKwh)}` : DASH,
      note: state.historyError ? `History unavailable: ${state.historyError}`
        : h && !h.available.battery ? "Energy is estimated from battery history; none is recorded in Home Assistant yet."
          : "Estimated from battery-level changes × pack capacity."
    });

    const days = root.querySelector("[data-days]");
    const charged = h?.charging || [];
    const used = h?.usage || [];
    const max = Math.max(1, ...charged.map((d) => d.kWh), ...used.map((d) => d.kWh));
    const html = charged.length
      ? charged.map((d, i) => {
        const u = used[i]?.kWh ?? 0;
        return `
          <div class="energy-day-row">
            <span>${escapeHtml(d.label)}</span>
            <div class="energy-day-bars">
              <div class="energy-bar-track"><div class="energy-bar-fill is-charged" style="width:${(d.kWh / max) * 100}%"></div></div>
              <div class="energy-bar-track"><div class="energy-bar-fill is-used" style="width:${(u / max) * 100}%"></div></div>
            </div>
            <b><span class="tone-green">+${fmtNumber(d.kWh, 1)}</span> / ${fmtNumber(u, 1)}</b>
          </div>`;
      }).join("")
      : '<p class="empty-state">No history yet.</p>';
    if (days.dataset.html !== html) {
      days.innerHTML = html;
      days.dataset.html = html;
    }
  }
};
