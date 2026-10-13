import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanRows, normaliseOwner, summariseReports } from "../src/etl/clean.js";
import { latencyTier } from "../src/config/thresholds.js";
import { parseCsv } from "../src/etl/csv.js";

// A valid baseline row. Each test changes one field.
const base = {
  report_id: "RPT_1", report_name: "Dash 1", owner_email: "User_1@Company.com",
  last_refresh_status: "SUCCESS", monthly_active_views: "100",
  snowflake_credits_consumed: "50.5", avg_load_time_sec: "10.0",
  aws_hosting_cost_usd: "20.0", query_count_last_30d: "500", concurrent_user_peak: "10",
};
const row = (over = {}) => ({ ...base, ...over });
const run = (rows) => cleanRows(rows);
const rule = (res, id) => res.log.find((r) => r.id === id).rows_affected;

test("valid row passes and owner email is lower-cased", () => {
  const res = run([row()]);
  assert.equal(res.clean.length, 1);
  assert.equal(res.clean[0].owner_email, "user_1@company.com");
  assert.equal(res.clean[0].is_orphaned, false);
});

test("R2: 'nan', 'ORPHANED_REPORT' and empty owners are flagged, kept, and email set to null", () => {
  const res = run([row({ owner_email: "nan" }), row({ report_id: "RPT_2", owner_email: "ORPHANED_REPORT" }), row({ report_id: "RPT_3", owner_email: "  " })]);
  assert.equal(res.clean.length, 3);
  assert.ok(res.clean.every((r) => r.is_orphaned && r.owner_email === null));
  assert.equal(rule(res, "R2"), 3);
  assert.deepEqual(res.clean.map((r) => r.orphan_reason), ["nan", "ORPHANED_REPORT", "empty"]);
});

test("R3: a malformed owner string is quarantined", () => {
  const res = run([row({ owner_email: "not-an-email" })]);
  assert.equal(res.clean.length, 0);
  assert.equal(rule(res, "R3"), 1);
});

test("R4: negative credits are quarantined, not clamped or deleted silently", () => {
  const res = run([row({ snowflake_credits_consumed: "-7.5" })]);
  assert.equal(res.clean.length, 0);
  assert.equal(res.rejected.length, 1);
  assert.equal(res.rejected[0].rule, "R4");
  assert.equal(res.rejected[0].source_row, 2);
});

test("R5: zero or negative latency is quarantined", () => {
  assert.equal(rule(run([row({ avg_load_time_sec: "0" })]), "R5"), 1);
  assert.equal(rule(run([row({ avg_load_time_sec: "-3" })]), "R5"), 1);
});

test("R6: latency spikes are KEPT and tiered (15s boundary is exclusive)", () => {
  const res = run([
    row({ avg_load_time_sec: "15" }),
    row({ report_id: "R2", avg_load_time_sec: "15.1" }),
    row({ report_id: "R3", avg_load_time_sec: "30" }),
    row({ report_id: "R4", avg_load_time_sec: "55" }),
  ]);
  assert.equal(res.clean.length, 4);
  assert.deepEqual(res.clean.map((r) => r.latency_tier), ["ok", "warning", "high", "critical"]);
  assert.equal(rule(res, "R6"), 3);
});

test("latencyTier thresholds", () => {
  assert.equal(latencyTier(15), "ok");
  assert.equal(latencyTier(15.01), "warning");
  assert.equal(latencyTier(29.9), "warning");
  assert.equal(latencyTier(30), "high");
  assert.equal(latencyTier(50), "critical");
});

test("R7: UNKNOWN status is kept but marked status_known = false", () => {
  const res = run([row({ last_refresh_status: "UNKNOWN" })]);
  assert.equal(res.clean[0].status_known, false);
  assert.equal(rule(res, "R7"), 1);
});

test("R8: an unrecognised status is quarantined; casing and spaces are normalised", () => {
  assert.equal(rule(run([row({ last_refresh_status: "BROKEN" })]), "R8"), 1);
  assert.equal(run([row({ last_refresh_status: " success " })]).clean[0].refresh_status, "SUCCESS");
});

test("R9: zero views kept with has_views = false", () => {
  const res = run([row({ monthly_active_views: "0" })]);
  assert.equal(res.clean[0].has_views, false);
  assert.equal(rule(res, "R9"), 1);
});

test("R10: exact duplicates are quarantined once", () => {
  const res = run([row(), row()]);
  assert.equal(res.clean.length, 1);
  assert.equal(rule(res, "R10"), 1);
});

test("R1/R11/R12: bad numerics are quarantined", () => {
  assert.equal(rule(run([row({ aws_hosting_cost_usd: "abc" })]), "R1"), 1);
  assert.equal(rule(run([row({ monthly_active_views: "-1" })]), "R11"), 1);
  assert.equal(rule(run([row({ concurrent_user_peak: "2.5" })]), "R11"), 1);
  assert.equal(rule(run([row({ aws_hosting_cost_usd: "-1" })]), "R12"), 1);
});

test("conservation: clean + quarantined always equals input", () => {
  const res = run([row(), row({ snowflake_credits_consumed: "-1" }), row({ report_id: "X", owner_email: "nan" }), row()]);
  assert.equal(res.totals.clean + res.totals.quarantined, res.totals.input);
});

test("normaliseOwner", () => {
  assert.deepEqual(normaliseOwner("ORPHANED_REPORT"), { owner: null, orphaned: true, reason: "ORPHANED_REPORT" });
  assert.equal(normaliseOwner(" A@B.com ").owner, "a@b.com");
});

test("summariseReports: failure rate excludes UNKNOWN, cost-per-view is null with zero views", () => {
  const res = run([
    row({ last_refresh_status: "SUCCESS" }),
    row({ owner_email: "user_2@company.com", last_refresh_status: "FAILED", snowflake_credits_consumed: "10" }),
    row({ owner_email: "nan", last_refresh_status: "UNKNOWN", snowflake_credits_consumed: "5" }),
  ]);
  const [rep] = summariseReports(res.clean);
  assert.equal(rep.observations, 3);
  assert.equal(rep.refresh_failure_rate, 0.5); // 1 failed of 2 known
  assert.equal(rep.unknown_status_observations, 1);
  assert.equal(rep.orphaned_observations, 1);
  assert.equal(rep.latest_known_owner, "user_2@company.com");

  const zero = summariseReports(run([row({ monthly_active_views: "0" })]).clean)[0];
  assert.equal(zero.credits_per_view, null);
});

test("parseCsv handles quoted commas", () => {
  const out = parseCsv('a,b\n1,"x, y"\n');
  assert.deepEqual(out, [{ a: "1", b: "x, y" }]);
});