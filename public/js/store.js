/**
 * Tiny store: one state object, explicit `set()`, subscribers notified once per
 * animation frame. Optimistic command values live in `pending` and are overlaid
 * on the server snapshot until the server confirms them (or they expire).
 */

const PENDING_TTL_MS = 20_000;
// rAF batches renders; the timer fallback keeps hidden tabs (where rAF pauses) current.
function schedule(fn) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    fn();
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  setTimeout(run, 50);
}

export function createStore(initial) {
  let state = initial;
  let queued = false;
  const subscribers = new Set();

  const notify = () => {
    queued = false;
    for (const fn of subscribers) fn(state);
  };

  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...next };
      if (!queued) {
        queued = true;
        schedule(notify);
      }
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }
  };
}

/** Vehicle as the UI should show it: server values with optimistic overrides applied. */
export function effectiveVehicle(state, now = Date.now()) {
  const base = state.snapshot?.vehicle;
  if (!base) return null;
  const overrides = {};
  for (const [key, entry] of Object.entries(state.pending || {})) {
    if (entry.inFlight || entry.until > now) overrides[key] = entry.value;
  }
  return Object.keys(overrides).length ? { ...base, ...overrides } : base;
}

/** Drop pending entries the server has confirmed or that have expired. */
export function reconcilePending(pending, vehicle, now = Date.now()) {
  const next = {};
  for (const [key, entry] of Object.entries(pending || {})) {
    if (entry.inFlight) next[key] = entry;
    else if (entry.until > now && vehicle && vehicle[key] !== entry.value) next[key] = entry;
  }
  return next;
}

export function settledPending(value, now = Date.now()) {
  return { value, inFlight: false, until: now + PENDING_TTL_MS };
}
