/** Shell-level UI primitives: toast, confirm sheet, data binding helpers. */

const $ = (sel, root = document) => root.querySelector(sel);

let toastTimer = null;

/** @param {"info"|"success"|"error"} tone */
export function toast(message, tone = "info") {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), tone === "error" ? 4500 : 2400);
}

/**
 * Ask the user to confirm a consequential action.
 * @returns {Promise<boolean>}
 */
export function confirmAction({ title, body = "", confirmLabel = "Confirm", danger = false }) {
  const dialog = $("#confirmDialog");
  if (!dialog || typeof dialog.showModal !== "function") return Promise.resolve(window.confirm(title));
  $("#confirmTitle", dialog).textContent = title;
  $("#confirmBody", dialog).textContent = body;
  const ok = $("#confirmOk", dialog);
  ok.textContent = confirmLabel;
  ok.classList.toggle("is-danger", danger);

  // Resolve from the buttons/Escape directly rather than the `close` event,
  // which some embedded browsers don't dispatch reliably.
  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed) => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("keydown", onKey);
      if (dialog.open) dialog.close(confirmed ? "confirm" : "cancel");
      resolve(confirmed);
    };
    const onClick = (event) => {
      if (event.target === dialog) return finish(false); // backdrop click
      const button = event.target.closest("button[value]");
      if (!button) return;
      event.preventDefault();
      finish(button.value === "confirm");
    };
    const onCancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    const onClose = () => finish(dialog.returnValue === "confirm");
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      finish(false);
    };

    dialog.returnValue = "";
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);
    dialog.addEventListener("keydown", onKey);
    dialog.showModal();
    ok.focus();
  });
}

/** Set textContent for every `[data-bind=key]` in root from a map of values. */
export function bindText(root, values) {
  root.querySelectorAll("[data-bind]").forEach((el) => {
    const key = el.dataset.bind;
    if (!(key in values)) return;
    const text = String(values[key]);
    if (el.textContent !== text) el.textContent = text;
  });
}

/** Toggle a class on every element matching selector. */
export function toggleAll(root, selector, className, on) {
  root.querySelectorAll(selector).forEach((el) => el.classList.toggle(className, Boolean(on)));
}
