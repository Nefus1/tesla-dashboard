import { tempBounds } from "../actions.js";
import { DASH, SEAT_LEVELS, fmtTemp, fmtTempValue } from "../format.js";
import { bindText } from "../ui.js";
import { tile, updateToggles } from "./shared.js";

function seatRow(key, label) {
  return `
    <div class="seat-heat-item" data-seat="${key}">
      <div class="seat-heat-label"><span data-icon="seat" class="seat-icon"></span><span>${label}</span></div>
      <div class="seat-levels" role="radiogroup" aria-label="${label} seat heat">
        ${SEAT_LEVELS.map((name, level) => `<button class="seat-btn" type="button" role="radio" aria-checked="false" data-seat-level="${level}">${name}</button>`).join("")}
      </div>
    </div>`;
}

export const climate = {
  id: "climate",
  title: "Climate",

  mount(root, ctx) {
    root.innerHTML = `
<div class="view-grid view-climate-grid">
  <section class="panel climate-main-panel">
    <div class="panel-heading">
      <div><p class="eyebrow">Climate</p><h2>Cabin temperature</h2></div>
      <button class="control-tile climate-toggle-btn" type="button" data-toggle="climate" aria-pressed="false">
        <span data-icon="fan"></span><b data-toggle-label>Climate</b>
      </button>
    </div>

    <div class="temp-control">
      <button class="temp-btn" type="button" data-temp="-1" aria-label="Decrease target temperature">&#8722;</button>
      <div class="temp-display" aria-live="polite">
        <div class="temp-number"><span data-bind="target">${DASH}</span><small data-bind="unit">°F</small></div>
        <p class="temp-actual" data-bind="actual"></p>
      </div>
      <button class="temp-btn" type="button" data-temp="1" aria-label="Increase target temperature">&#43;</button>
    </div>

    <div class="climate-toggles">
      ${tile("defrost", "defrost", "Front defrost")}
      ${tile("defrostRear", "defrost", "Rear defrost")}
    </div>
  </section>

  <section class="panel climate-comfort-panel">
    <div class="panel-heading">
      <div><p class="eyebrow">Comfort</p><h2>Seat heat</h2></div>
    </div>
    <div class="seat-heat-grid">
      ${seatRow("seatHeatDriver", "Driver")}
      ${seatRow("seatHeatPassenger", "Passenger")}
    </div>

    <div class="climate-info-cards">
      <div class="climate-info-card"><span>Outside</span><b data-bind="outside">${DASH}</b></div>
      <div class="climate-info-card"><span>Inside</span><b data-bind="inside">${DASH}</b></div>
      <div class="climate-info-card"><span>Target</span><b data-bind="targetCard">${DASH}</b></div>
      <div class="climate-info-card"><span>Status</span><b data-bind="status">${DASH}</b></div>
    </div>
  </section>
</div>`;

    root.addEventListener("click", (event) => {
      const temp = event.target.closest("[data-temp]");
      if (temp && !temp.disabled) return ctx.actions.adjustTemp(Number(temp.dataset.temp));

      const seatBtn = event.target.closest("[data-seat-level]");
      if (seatBtn && !seatBtn.disabled) {
        const key = seatBtn.closest("[data-seat]").dataset.seat;
        ctx.actions.setSeat(key, Number(seatBtn.dataset.seatLevel));
      }
    });
  },

  update(root, ctx) {
    const { v, caps, state } = ctx;
    const unit = v?.tempUnit || "F";
    const [min, max] = tempBounds(v);
    const canSetTemp = caps.targetTemp && v?.targetTemp != null;

    bindText(root, {
      target: v?.targetTemp != null ? fmtTempValue(v.targetTemp) : DASH,
      unit: `°${unit}`,
      actual: v?.cabinTemp != null ? `Inside ${fmtTemp(v.cabinTemp, unit)} · ${v.climate ? "Conditioning" : "Climate off"}` : v?.climate ? "Conditioning" : "",
      outside: fmtTemp(v?.outsideTemp, unit),
      inside: fmtTemp(v?.cabinTemp, unit),
      targetCard: fmtTemp(v?.targetTemp, unit),
      status: v?.climate == null ? DASH : v.climate ? "On" : "Off"
    });

    root.querySelector('[data-temp="-1"]').disabled = !canSetTemp || v.targetTemp <= min;
    root.querySelector('[data-temp="1"]').disabled = !canSetTemp || v.targetTemp >= max;
    root.querySelector(".temp-number").classList.toggle("is-off", !v?.climate);

    root.querySelectorAll("[data-seat]").forEach((row) => {
      const key = row.dataset.seat;
      const level = v?.[key];
      const pending = Boolean(state.pending[key]?.inFlight);
      row.classList.toggle("is-unavailable", !caps[key]);
      row.querySelectorAll("[data-seat-level]").forEach((btn) => {
        const active = Number(btn.dataset.seatLevel) === level;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-checked", String(active));
        btn.disabled = !caps[key] || level == null || pending;
      });
      row.title = caps[key] ? "" : "Not configured — map this entity in .env";
    });

    updateToggles(root, ctx);
  }
};
