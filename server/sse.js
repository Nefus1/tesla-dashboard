/** Minimal Server-Sent Events hub. */
export class SseHub {
  constructor({ heartbeatMs = 25_000 } = {}) {
    this.clients = new Set();
    this.timer = setInterval(() => this.comment("ping"), heartbeatMs);
    this.timer.unref?.();
  }

  get size() {
    return this.clients.size;
  }

  /** Attach a response stream. `initial` is a list of [event, data] sent right away. */
  connect(req, res, initial = []) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.write("retry: 3000\n\n");
    this.clients.add(res);
    for (const [event, data] of initial) this.write(res, event, data);
    const drop = () => this.clients.delete(res);
    req.on("close", drop);
    res.on("error", drop);
  }

  write(res, event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      this.clients.delete(res);
    }
  }

  broadcast(event, data) {
    for (const res of this.clients) this.write(res, event, data);
  }

  comment(text) {
    for (const res of this.clients) {
      try { res.write(`: ${text}\n\n`); } catch { this.clients.delete(res); }
    }
  }

  close() {
    clearInterval(this.timer);
    for (const res of this.clients) {
      try { res.end(); } catch { /* ignore */ }
    }
    this.clients.clear();
  }
}
