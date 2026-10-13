// Alert engine: turns telemetry into alerts.
//
// Rules (thresholds come from config, see .env.example):
//   LATENCY_BREACH   load time above LATENCY_WARNING_SEC (15s); severity by tier
//   REFRESH_FAILURE  refresh status FAILED or TIMED_OUT
//   (UNKNOWN status raises no alert: we do not know it failed, see data quality rule R7)
//
// Noise control: the same alert type for the same report is suppressed for
// ALERT_COOLDOWN_SEC, unless the severity got worse. The next alert that does
// fire reports how many were suppressed, so nothing is silently lost.
import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { latencyTier } from "../config/thresholds.js";

export const SEVERITY_RANK = { warning: 1, high: 2, critical: 3 };

export class AlertEngine extends EventEmitter {
  constructor({ cooldownSec, bufferSize, latencyTiers, now = () => Date.now() }) {
    super();
    this.cooldownMs = cooldownSec * 1000;
    this.bufferSize = bufferSize;
    this.latencyTiers = latencyTiers;
    this.now = now; // injectable clock, so tests can move time forward
    this.alerts = []; // newest first, capped at bufferSize
    this.lastFired = new Map(); // `${report_id}|${type}` -> { at, severity, suppressed }
    this.stats = { evaluated: 0, fired: 0, suppressed: 0 };
  }

  // Which alerts this observation deserves, before cooldown is applied.
  candidates(obs) {
    const out = [];
    const tier = latencyTier(obs.avg_load_time_sec, this.latencyTiers);
    if (tier !== "ok") {
      out.push({
        type: "LATENCY_BREACH",
        severity: tier,
        value: obs.avg_load_time_sec,
        threshold: this.latencyTiers.warning,
        message: `${obs.report_name} loaded in ${obs.avg_load_time_sec}s (threshold ${this.latencyTiers.warning}s)`,
      });
    }
    if (obs.refresh_status === "FAILED" || obs.refresh_status === "TIMED_OUT") {
      out.push({
        type: "REFRESH_FAILURE",
        severity: "high",
        value: obs.refresh_status,
        threshold: "SUCCESS",
        message: `${obs.report_name} data refresh ${obs.refresh_status === "FAILED" ? "failed" : "timed out"}`,
      });
    }
    return out;
  }

  // Evaluate one observation; returns the alerts that actually fired.
  evaluate(obs, { owner = null } = {}) {
    this.stats.evaluated++;
    const fired = [];
    for (const c of this.candidates(obs)) {
      const key = `${obs.report_id}|${c.type}`;
      const prev = this.lastFired.get(key);
      const t = this.now();
      const inCooldown = prev && t - prev.at < this.cooldownMs;
      const escalated = prev && SEVERITY_RANK[c.severity] > SEVERITY_RANK[prev.severity];
      if (inCooldown && !escalated) {
        prev.suppressed++;
        this.stats.suppressed++;
        continue;
      }
      const alert = {
        id: crypto.randomUUID(),
        ...c,
        report_id: obs.report_id,
        report_name: obs.report_name,
        owner,
        source_row: obs.source_row,
        created_at: new Date(t).toISOString(),
        suppressed_since_last: prev?.suppressed ?? 0,
        acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null,
      };
      this.lastFired.set(key, { at: t, severity: c.severity, suppressed: 0 });
      this.alerts.unshift(alert);
      if (this.alerts.length > this.bufferSize) this.alerts.length = this.bufferSize;
      this.stats.fired++;
      fired.push(alert);
      this.emit("alert", alert);
    }
    return fired;
  }

  acknowledge(id, userEmail) {
    const alert = this.alerts.find((a) => a.id === id);
    if (!alert) return null;
    if (!alert.acknowledged) {
      alert.acknowledged = true;
      alert.acknowledged_by = userEmail;
      alert.acknowledged_at = new Date(this.now()).toISOString();
      this.emit("ack", alert);
    }
    return alert;
  }

  find(id) {
    return this.alerts.find((a) => a.id === id) ?? null;
  }
}