// Telemetry replay simulator.
// The dataset has no timestamps, so we replay the cleaned observations in file
// order, one every REPLAY_INTERVAL_MS, as if they were arriving live. Each one
// is evaluated by the alert engine and broadcast as a telemetry event.
// In production this class is replaced by a real feed (portal load-time
// metrics, Snowflake task history); the engine and WebSocket layer stay the same.
import { EventEmitter } from "node:events";

export class ReplaySimulator extends EventEmitter {
  constructor({ observations, ownerOf, engine, intervalMs, loop }) {
    super();
    this.observations = [...observations].sort((a, b) => a.source_row - b.source_row);
    this.ownerOf = ownerOf; // report_id -> latest known owner, used for alert routing
    this.engine = engine;
    this.intervalMs = intervalMs;
    this.loop = loop;
    this.position = 0;
    this.timer = null;
    this.cycles = 0;
  }

  get running() {
    return this.timer !== null;
  }

  status() {
    return {
      running: this.running,
      position: this.position,
      total: this.observations.length,
      cycles_completed: this.cycles,
      interval_ms: this.intervalMs,
      loop: this.loop,
    };
  }

  // Process one observation. Public so tests can step through deterministically.
  step() {
    if (this.position >= this.observations.length) {
      if (!this.loop) return this.stop();
      this.position = 0;
      this.cycles++;
    }
    const obs = this.observations[this.position++];
    const alerts = this.engine.evaluate(obs, { owner: this.ownerOf(obs.report_id) });
    this.emit("telemetry", {
      report_id: obs.report_id,
      report_name: obs.report_name,
      avg_load_time_sec: obs.avg_load_time_sec,
      latency_tier: obs.latency_tier,
      refresh_status: obs.refresh_status,
      source_row: obs.source_row,
      alerts_fired: alerts.length,
      at: new Date().toISOString(),
    });
    return obs;
  }

  start() {
    if (!this.running) {
      this.timer = setInterval(() => this.step(), this.intervalMs);
      this.timer.unref?.(); // never keeps the process alive on its own
      this.emit("status", this.status());
    }
    return this.status();
  }

  stop() {
    if (this.running) {
      clearInterval(this.timer);
      this.timer = null;
      this.emit("status", this.status());
    }
    return this.status();
  }
}