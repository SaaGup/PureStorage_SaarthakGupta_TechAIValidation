// Unit tests for the alert engine and replay simulator (no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { AlertEngine } from "../src/alerts/engine.js";
import { ReplaySimulator } from "../src/alerts/replay.js";

const TIERS = { warning: 15, high: 30, critical: 50 };
const obs = (over = {}) => ({
  source_row: 2, report_id: "RPT_1", report_name: "Dash 1",
  avg_load_time_sec: 10, latency_tier: "ok", refresh_status: "SUCCESS", ...over,
});

function makeEngine({ cooldownSec = 60, bufferSize = 10 } = {}) {
  let clock = 1_000_000;
  const engine = new AlertEngine({ cooldownSec, bufferSize, latencyTiers: TIERS, now: () => clock });
  return { engine, advance: (sec) => { clock += sec * 1000; } };
}

test("exactly 15s does not alert; just above 15s does (brief: 'exceeds 15 seconds')", () => {
  const { engine } = makeEngine();
  assert.equal(engine.evaluate(obs({ avg_load_time_sec: 15 })).length, 0);
  const [a] = engine.evaluate(obs({ report_id: "RPT_2", avg_load_time_sec: 15.1 }));
  assert.equal(a.type, "LATENCY_BREACH");
  assert.equal(a.severity, "warning");
});

test("severity follows the latency tiers", () => {
  const { engine } = makeEngine();
  const sev = (s, id) => engine.evaluate(obs({ report_id: id, avg_load_time_sec: s }))[0].severity;
  assert.equal(sev(20, "A"), "warning");
  assert.equal(sev(30, "B"), "high");
  assert.equal(sev(55, "C"), "critical");
});

test("FAILED and TIMED_OUT refreshes alert; UNKNOWN and SUCCESS do not", () => {
  const { engine } = makeEngine();
  assert.equal(engine.evaluate(obs({ report_id: "A", refresh_status: "FAILED" }))[0].type, "REFRESH_FAILURE");
  assert.equal(engine.evaluate(obs({ report_id: "B", refresh_status: "TIMED_OUT" }))[0].type, "REFRESH_FAILURE");
  assert.equal(engine.evaluate(obs({ report_id: "C", refresh_status: "UNKNOWN" })).length, 0);
  assert.equal(engine.evaluate(obs({ report_id: "D" })).length, 0);
});

test("one slow AND failed observation raises two alerts", () => {
  const { engine } = makeEngine();
  const fired = engine.evaluate(obs({ avg_load_time_sec: 40, refresh_status: "FAILED" }));
  assert.deepEqual(fired.map((a) => a.type).sort(), ["LATENCY_BREACH", "REFRESH_FAILURE"]);
});

test("cooldown suppresses repeats, then reports how many were suppressed", () => {
  const { engine, advance } = makeEngine({ cooldownSec: 60 });
  assert.equal(engine.evaluate(obs({ avg_load_time_sec: 20 })).length, 1);
  advance(10);
  assert.equal(engine.evaluate(obs({ avg_load_time_sec: 21 })).length, 0);
  advance(10);
  assert.equal(engine.evaluate(obs({ avg_load_time_sec: 22 })).length, 0);
  assert.equal(engine.stats.suppressed, 2);
  advance(60);
  const [a] = engine.evaluate(obs({ avg_load_time_sec: 23 }));
  assert.equal(a.suppressed_since_last, 2);
});

test("an escalation breaks through the cooldown", () => {
  const { engine, advance } = makeEngine({ cooldownSec: 60 });
  engine.evaluate(obs({ avg_load_time_sec: 20 }));
  advance(5);
  const [a] = engine.evaluate(obs({ avg_load_time_sec: 52 }));
  assert.equal(a.severity, "critical");
});

test("cooldown is per report and per alert type", () => {
  const { engine } = makeEngine();
  engine.evaluate(obs({ avg_load_time_sec: 20 }));
  assert.equal(engine.evaluate(obs({ report_id: "OTHER", avg_load_time_sec: 20 })).length, 1);
  assert.equal(engine.evaluate(obs({ avg_load_time_sec: 10, refresh_status: "FAILED" })).length, 1);
});

test("the alert buffer is capped, newest first", () => {
  const { engine } = makeEngine({ bufferSize: 10 });
  for (let i = 0; i < 25; i++) engine.evaluate(obs({ report_id: `R${i}`, avg_load_time_sec: 20 }));
  assert.equal(engine.alerts.length, 10);
  assert.equal(engine.alerts[0].report_id, "R24");
});

test("acknowledge records who and when, and only once", () => {
  const { engine } = makeEngine();
  const [a] = engine.evaluate(obs({ avg_load_time_sec: 20 }));
  let acks = 0;
  engine.on("ack", () => acks++);
  engine.acknowledge(a.id, "x@y.com");
  engine.acknowledge(a.id, "z@y.com");
  assert.equal(a.acknowledged_by, "x@y.com");
  assert.equal(acks, 1);
  assert.equal(engine.acknowledge("missing", "x@y.com"), null);
});

test("replay walks observations in file order, loops, and emits telemetry", () => {
  const { engine } = makeEngine({ cooldownSec: 0 });
  const observations = [obs({ source_row: 3, avg_load_time_sec: 20 }), obs({ source_row: 2 })];
  const replay = new ReplaySimulator({ observations, ownerOf: () => "o@x.com", engine, intervalMs: 1000, loop: true });
  const seen = [];
  replay.on("telemetry", (t) => seen.push(t.source_row));
  replay.step(); replay.step(); replay.step();
  assert.deepEqual(seen, [2, 3, 2]);
  assert.equal(replay.status().cycles_completed, 1);
  assert.equal(engine.alerts[0].owner, "o@x.com");
});

test("replay without loop stops at the end", () => {
  const { engine } = makeEngine();
  const replay = new ReplaySimulator({ observations: [obs()], ownerOf: () => null, engine, intervalMs: 1000, loop: false });
  replay.start();
  replay.step();
  replay.step();
  assert.equal(replay.running, false);
});