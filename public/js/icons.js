/** Inline SVG icon strings, stamped into `[data-icon="name"]` elements. */
export const icons = {
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12v10H6z"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 9-3M6 10h12v10H6z"/></svg>',
  fan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M12 4c1.8 2.7 1.8 4.7 0 6M12 14c-1.8 1.3-1.8 3.3 0 6M4 12c2.7-1.8 4.7-1.8 6 0M14 12c1.3 1.8 3.3 1.8 6 0"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 13 4 4L19 7"/></svg>',
  frunk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 2-5h12l2 5v6H4zM7 18v2M17 18v2M4 12h16"/></svg>',
  defrost: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17c2-3 4-3 6 0s4 3 6 0 4-3 6 0M7 13c1.2-2 2.4-2 3.6 0s2.4 2 3.6 0 2.4-2 3.6 0M8 5h8l3 6H5z"/></svg>',
  sentry: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 7v5c0 5-3.3 8.5-8 9-4.7-.5-8-4-8-9V7z"/></svg>',
  hazard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 9 16H3zM12 9v5M12 17h.01"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM8 14l2.5-3 2 2.5L15 10l5 6M8 9h.01"/></svg>',
  trip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17 9 7l5 10 2-5 4 5M4 20h16"/></svg>',
  seat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v10a2 2 0 0 0 2 2h10M5 13l4 5h9a1 1 0 0 0 1-1v-4"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  plug: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9A7 7 0 0 1 18 6.8L20 11M4 13l1.9 4.2A7 7 0 0 0 18 15"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
};

export function renderIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((node) => {
    const name = node.dataset.icon;
    if (node.dataset.iconRendered === name) return;
    node.innerHTML = icons[name] || icons.check;
    node.dataset.iconRendered = name;
  });
}

/** Swap an element's icon in place. */
export function setIcon(node, name) {
  if (!node || node.dataset.iconRendered === name) return;
  node.dataset.icon = name;
  node.innerHTML = icons[name] || icons.check;
  node.dataset.iconRendered = name;
}
