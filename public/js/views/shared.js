/** Markup + update helpers shared by several views. */
import { DEFAULT_IMAGE } from "../image.js";
import { setIcon, icons } from "../icons.js";
import { DASH, escapeHtml, fmtPercent, fmtRelative, fmtTemp } from "../format.js";

/** A toggle tile. `key` is a command name; the global click handler sends it. */
export function tile(key, icon, label) {
  return `
    <button class="control-tile" type="button" data-toggle="${key}" aria-pressed="false">
      <span data-icon="${icon}" data-toggle-icon></span>
      <b data-toggle-label>${escapeHtml(label)}</b>
      <small data-toggle-sub></small>
    </button>`;
}

export function quickTiles() {
  return [
    tile("locked", "lock", "Lock"),
    tile("frunk", "frunk", "Frunk"),
    tile("climate", "fan", "Climate"),
    tile("defrost", "defrost", "Defrost"),
    tile("sentry", "sentry", "Sentry"),
    tile("hazard", "hazard", "Hazard")
  ].join("");
}

const LABEL = {
  locked: (v) => (v.locked ? "Locked" : v.locked === false ? "Unlocked" : "Lock"),
  frunk: (v) => (v.frunk ? "Frunk open" : "Frunk"),
  charging: (v) => (v.charging ? "Stop charging" : "Start charging"),
  climate: (v) => (v.climate ? "Climate on" : "Climate"),
  sentry: (v) => (v.sentry ? "Sentry on" : "Sentry")
};

const SUB = {
  climate: (v) => (v.cabinTemp != null ? `Inside ${fmtTemp(v.cabinTemp, v.tempUnit)}` : ""),
  locked: (v) => (v.locked === null ? "Unknown" : "")
};

/** Sync every `[data-toggle]` in root with vehicle state, pending commands and capabilities. */
export function updateToggles(root, ctx) {
  const { v, caps, state } = ctx;
  root.querySelectorAll("[data-toggle]").forEach((el) => {
    const key = el.dataset.toggle;
    const value = v ? v[key] : null;
    const pending = Boolean(state.pending[key]?.inFlight);
    const available = Boolean(caps[key]);
    const unknown = available && (value === null || value === undefined);

    el.classList.toggle("is-active", value === true);
    el.classList.toggle("is-pending", pending);
    el.classList.toggle("is-unavailable", !available);
    el.classList.toggle("is-unknown", unknown);
    if (el.getAttribute("role") === "switch") el.setAttribute("aria-checked", String(value === true));
    else el.setAttribute("aria-pressed", String(value === true));
    el.setAttribute("aria-busy", String(pending));
    el.setAttribute("aria-disabled", String(!available));
    el.title = !available ? "Not configured — map this entity in .env" : unknown ? "State unavailable" : "";

    if (key === "locked") setIcon(el.querySelector("[data-toggle-icon]"), value === false ? "unlock" : "lock");
    const label = el.querySelector("[data-toggle-label]");
    if (label && v && LABEL[key]) label.textContent = LABEL[key](v);
    const sub = el.querySelector("[data-toggle-sub]");
    if (sub) sub.textContent = !available ? "Not set up" : v && SUB[key] ? SUB[key](v) : "";
  });
}

// ─── Charge limit ─────────────────────────────────────────────────────────────

export function chargeLimitPanel(eyebrow = "Charging") {
  return `
    <section class="panel charge-panel">
      <div class="panel-heading">
        <div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>Charge limit</h2></div>
        <strong><span data-limit-value>${DASH}</span></strong>
      </div>
      <input class="limit-slider" data-limit-slider type="range" min="50" max="100" step="1" value="80" aria-label="Charge limit">
      <div class="slider-scale"><span data-limit-min>50</span><span>Daily</span><span>Trip</span><span data-limit-max>100</span></div>
    </section>`;
}

export function bindChargeLimit(root, actions) {
  const slider = root.querySelector("[data-limit-slider]");
  if (!slider) return;
  const label = root.querySelector("[data-limit-value]");
  slider.addEventListener("input", () => {
    label.textContent = `${slider.value}%`;
    slider.setAttribute("aria-valuetext", `${slider.value} percent`);
    slider.dataset.dragging = "1";
  });
  slider.addEventListener("change", async () => {
    await actions.setChargeLimit(Number(slider.value));
    delete slider.dataset.dragging;
  });
}

export function updateChargeLimit(root, ctx) {
  const slider = root.querySelector("[data-limit-slider]");
  if (!slider) return;
  const { v, caps } = ctx;
  const limit = v?.chargeLimit;
  slider.disabled = !caps.chargeLimit || limit == null;
  if (v) {
    slider.min = v.chargeLimitMin ?? 50;
    slider.max = v.chargeLimitMax ?? 100;
    root.querySelector("[data-limit-min]").textContent = slider.min;
    root.querySelector("[data-limit-max]").textContent = slider.max;
  }
  if (slider.dataset.dragging) return;
  if (limit != null) {
    slider.value = String(limit);
    slider.setAttribute("aria-valuetext", `${limit} percent`);
  }
  root.querySelector("[data-limit-value]").textContent = caps.chargeLimit ? fmtPercent(limit) : "Not set up";
}

// ─── Bar charts ───────────────────────────────────────────────────────────────

/** Render bars into a container whose children are reused across updates. */
export function renderBars(container, values, { titles = [], minPct = 4 } = {}) {
  if (!container) return;
  const max = Math.max(...values, 0);
  while (container.children.length < values.length) container.appendChild(document.createElement("span"));
  while (container.children.length > values.length) container.lastChild.remove();
  values.forEach((value, i) => {
    const bar = container.children[i];
    const height = max > 0 && value > 0 ? Math.max(minPct, (value / max) * 100) : 2;
    bar.style.height = `${height}%`;
    bar.classList.toggle("is-empty", !(value > 0));
    bar.title = titles[i] || "";
  });
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export function renderActivity(list, items, { limit = 5, now = Date.now() } = {}) {
  if (!list) return;
  const shown = items.slice(0, limit);
  if (!shown.length) {
    list.innerHTML = '<p class="empty-state">No activity yet. Changes to the car show up here.</p>';
    return;
  }
  list.innerHTML = shown.map((item) => `
    <article class="activity-item">
      <span class="activity-icon">${icons[item.icon] || icons.check}</span>
      <span>
        <time class="activity-time" datetime="${escapeHtml(item.at)}">${escapeHtml(fmtRelative(item.at, now))}</time>
        <b>${escapeHtml(item.title)}</b>
        ${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}
      </span>
    </article>`).join("");
}

// ─── Vehicle image ────────────────────────────────────────────────────────────

/** Attach the custom → default PNG → inline SVG fallback chain to every vehicle image. */
export function bindVehicleImages(root) {
  root.querySelectorAll("img[data-vehicle-image]").forEach((img) => {
    img.addEventListener("error", () => {
      if (!img.src.endsWith(DEFAULT_IMAGE)) {
        img.src = DEFAULT_IMAGE;
        return;
      }
      const template = document.getElementById("carFallbackTemplate");
      if (template) img.replaceWith(template.content.firstElementChild.cloneNode(true));
    });
  });
}

export function updateVehicleImages(root, image) {
  const src = image || DEFAULT_IMAGE;
  root.querySelectorAll("img[data-vehicle-image]").forEach((img) => {
    if (img.getAttribute("src") !== src) img.setAttribute("src", src);
  });
}

export function notConfigured(text = "Not configured") {
  return `<span class="muted-note">${escapeHtml(text)}</span>`;
}
