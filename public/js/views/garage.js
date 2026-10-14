import { prepareImage, saveImage } from "../image.js";
import { DASH, escapeHtml, fmtDistance, fmtRelative } from "../format.js";
import { bindText, toast } from "../ui.js";
import { bindVehicleImages, quickTiles, updateToggles, updateVehicleImages } from "./shared.js";

export const garage = {
  id: "garage",
  title: "Garage",

  mount(root, ctx) {
    const vehicle = ctx.config?.vehicle || {};
    root.innerHTML = `
<div class="view-grid view-garage-grid">
  <section class="panel garage-vehicle-panel">
    <div class="panel-heading">
      <div><p class="eyebrow">Your vehicle</p><h2>${escapeHtml(vehicle.name || "Model Y")}</h2></div>
      <span class="live-dot" data-garage-pill>Live</span>
    </div>
    <div class="garage-image-wrap">
      <img class="vehicle-image garage-vehicle-img" data-vehicle-image alt="Your vehicle" width="400" height="600">
    </div>
    <dl class="spec-list">
      <div class="spec-row"><dt>Model</dt><dd>${escapeHtml(vehicle.model || DASH)}</dd></div>
      ${vehicle.color ? `<div class="spec-row"><dt>Color</dt><dd>${escapeHtml(vehicle.color)}</dd></div>` : ""}
      <div class="spec-row"><dt>Location</dt><dd data-bind="location">${DASH}</dd></div>
      <div class="spec-row"><dt>Odometer</dt><dd data-bind="odometer">${DASH}</dd></div>
      <div class="spec-row"><dt>Software</dt><dd><span data-bind="software">${DASH}</span> <span class="badge" data-software-badge hidden></span></dd></div>
      <div class="spec-row"><dt>Last update from car</dt><dd data-bind="updated">${DASH}</dd></div>
    </dl>
  </section>

  <section class="panel garage-controls-panel">
    <div class="panel-heading">
      <div><p class="eyebrow">Controls</p><h2>Quick actions</h2></div>
    </div>
    <div class="control-grid">${quickTiles()}</div>

    <div class="garage-section">
      <p class="eyebrow">Display</p>
      <div class="vehicle-upload-row">
        <label class="upload-button">
          <span data-icon="image"></span>
          <span>Upload vehicle image</span>
          <input data-image-input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml">
        </label>
        <button class="reset-image-button" type="button" data-image-reset>Reset</button>
      </div>
      <p class="schedule-note">Images are resized and stored only in this browser.</p>
    </div>

    <div class="garage-section" data-missing hidden>
      <p class="eyebrow">Setup</p>
      <p class="schedule-note">These entities are configured in <code>.env</code> but Home Assistant doesn't report them:</p>
      <ul class="missing-list" data-missing-list></ul>
    </div>
  </section>
</div>`;

    bindVehicleImages(root);

    const input = root.querySelector("[data-image-input]");
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      try {
        const dataUrl = await prepareImage(file);
        if (!saveImage(dataUrl)) throw new Error("Not enough browser storage for that image");
        ctx.store.set({ image: dataUrl });
        toast("Vehicle image updated", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });

    root.querySelector("[data-image-reset]").addEventListener("click", () => {
      saveImage(null);
      ctx.store.set({ image: null });
      toast("Default vehicle image restored", "success");
    });
  },

  update(root, ctx) {
    const { v, snap, state, now } = ctx;
    bindText(root, {
      location: v?.location || DASH,
      odometer: fmtDistance(v?.odometer, v?.distanceUnit),
      software: v?.softwareVersion || DASH,
      updated: snap?.updatedAt ? fmtRelative(snap.updatedAt, now) : DASH
    });

    const badge = root.querySelector("[data-software-badge]");
    if (v?.updateAvailable === true) {
      badge.hidden = false;
      badge.className = "badge badge-info";
      badge.textContent = v.latestVersion ? `${v.latestVersion} available` : "Update available";
    } else if (v?.updateAvailable === false) {
      badge.hidden = false;
      badge.className = "badge badge-ok";
      badge.textContent = "Up to date";
    } else badge.hidden = true;

    const pill = root.querySelector("[data-garage-pill]");
    pill.textContent = ctx.connectionLabel.label;
    pill.className = `live-dot ${ctx.connectionLabel.tone}`;

    root.querySelector("[data-image-reset]").disabled = !state.image;

    const missing = snap?.missingEntities || [];
    root.querySelector("[data-missing]").hidden = missing.length === 0;
    const list = root.querySelector("[data-missing-list]");
    const html = missing.map((m) => `<li><code>${escapeHtml(m.entityId)}</code> <span>(${escapeHtml(m.key)})</span></li>`).join("");
    if (list.innerHTML !== html) list.innerHTML = html;

    updateToggles(root, ctx);
    updateVehicleImages(root, state.image);
  }
};
