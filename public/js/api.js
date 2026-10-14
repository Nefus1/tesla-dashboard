/** Backend API client + live event stream. */

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    });
  } catch {
    throw new ApiError("Dashboard server is unreachable", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message || `Request failed (${res.status})`, res.status);
  return data;
}

export const api = {
  config: () => request("/api/config"),
  state: () => request("/api/state"),
  history: () => request("/api/history"),
  activity: () => request("/api/activity"),
  command: (command, value) => request("/api/command", { method: "POST", body: { command, value } }),
  refresh: () => request("/api/refresh", { method: "POST", body: {} }),
  resetTrip: () => request("/api/trip/reset", { method: "POST", body: {} })
};

/**
 * Subscribe to server-sent events. Falls back to polling /api/state when
 * EventSource is unavailable. Returns a disconnect function.
 * @param {{ onState: Function, onActivity: Function, onActivityLog: Function, onConnection: (s: "live"|"reconnecting"|"offline") => void }} handlers
 */
export function connectLive(handlers, { pollMs = 30_000 } = {}) {
  let source = null;
  let pollTimer = null;
  let failures = 0;

  const poll = async () => {
    try {
      handlers.onState(await api.state());
      handlers.onConnection("live");
    } catch {
      handlers.onConnection("offline");
    }
  };

  if (typeof EventSource !== "function") {
    poll();
    pollTimer = setInterval(poll, pollMs);
    return () => clearInterval(pollTimer);
  }

  let retryTimer = null;
  let closed = false;

  const open = () => {
    source = new EventSource("/api/events");
    source.addEventListener("open", () => {
      failures = 0;
      handlers.onConnection("live");
    });
    source.addEventListener("state", (e) => handlers.onState(JSON.parse(e.data)));
    source.addEventListener("activity", (e) => handlers.onActivity(JSON.parse(e.data)));
    source.addEventListener("activity-log", (e) => handlers.onActivityLog(JSON.parse(e.data)));
    source.addEventListener("error", () => {
      failures++;
      // EventSource retries network errors itself; after a few failures report "offline".
      handlers.onConnection(failures >= 3 ? "offline" : "reconnecting");
      // A non-200 response closes the stream for good — reopen it ourselves.
      if (source.readyState === EventSource.CLOSED && !closed) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(open, Math.min(30_000, 2000 * failures));
      }
    });
  };
  open();

  return () => {
    closed = true;
    clearTimeout(retryTimer);
    source.close();
  };
}
