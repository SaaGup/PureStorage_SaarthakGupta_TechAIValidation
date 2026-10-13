import { test } from "node:test";
import assert from "node:assert/strict";
import { liveReducer, initialLiveState, telemetryStats, backoffMs, MAX_TELEMETRY } from "./liveReducer.js";

const alert = (id, created_at, extra = {}) => ({ id, created_at, severity: "warning", acknowledged: false, ...extra });

test("hello merges alerts without duplicates and marks the connection open", () => {
  let s = liveReducer(initialLiveState, { type: "alert", alert: alert("a", "2026-01-01T00:00:01Z") });
  s = liveReducer(s, {
    type: "hello",
    alerts: [alert("b", "2026-01-01T00:00:02Z"), alert("a", "2026-01-01T00:00:01Z")],
    replay: { running: true },
    thresholds: { latency: { warning: 15 } },
  });
  assert.equal(s.connection, "open");
  assert.deepEqual(s.alerts.map((a) => a.id), ["b", "a"]);
});

test("hello replaces the telemetry backlog (capped)", () => {
  const backlog = Array.from({ length: MAX_TELEMETRY + 5 }, (_, i) => ({ source_row: i }));
  const s = liveReducer(initialLiveState, { type: "hello", alerts: [], telemetry: backlog, replay: null, thresholds: null });
  assert.equal(s.telemetry.length, MAX_TELEMETRY);
  assert.equal(s.telemetry.at(-1).source_row, MAX_TELEMETRY + 4);
});

test("alert_ack updates the existing alert in place", () => {
  let s = liveReducer(initialLiveState, { type: "alert", alert: alert("a", "2026-01-01T00:00:01Z") });
  s = liveReducer(s, { type: "alert_ack", alert: alert("a", "2026-01-01T00:00:01Z", { acknowledged: true, acknowledged_by: "x" }) });
  assert.equal(s.alerts.length, 1);
  assert.equal(s.alerts[0].acknowledged, true);
});

test("telemetry keeps only the most recent observations", () => {
  let s = initialLiveState;
  for (let i = 0; i < MAX_TELEMETRY + 10; i++) {
    s = liveReducer(s, { type: "telemetry", data: { source_row: i, avg_load_time_sec: 10 } });
  }
  assert.equal(s.telemetry.length, MAX_TELEMETRY);
  assert.equal(s.telemetry[0].source_row, 10);
  assert.equal(s.received, MAX_TELEMETRY + 10);
});

test("unknown actions leave state unchanged", () => {
  assert.equal(liveReducer(initialLiveState, { type: "nope" }), initialLiveState);
});

test("telemetryStats counts breaches above (not at) the threshold and failures", () => {
  const t = [
    { avg_load_time_sec: 15, refresh_status: "SUCCESS" },
    { avg_load_time_sec: 20, refresh_status: "FAILED" },
    { avg_load_time_sec: 40, refresh_status: "TIMED_OUT" },
    { avg_load_time_sec: 5, refresh_status: "UNKNOWN" },
  ];
  const s = telemetryStats(t, 15);
  assert.equal(s.breaches, 2);
  assert.equal(s.failures, 2);
  assert.equal(s.p50, 20);
  assert.equal(telemetryStats([]).p95, null);
});

test("backoff grows and is capped at 30s", () => {
  const mid = () => 0.5; // no jitter
  assert.equal(backoffMs(0, mid), 1000);
  assert.equal(backoffMs(3, mid), 8000);
  assert.equal(backoffMs(20, mid), 30000);
});