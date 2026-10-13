// Data cleaning rules for the Pure Insights monitoring extract.
//
// Design principles (these are the points to make in the interview):
//  1. Raw data is never modified. We read it and write new files.
//  2. We never silently delete. A bad row is "quarantined" with a reason.
//  3. Every rule counts the rows it touched, so the quality log is evidence.
//  4. Latency spikes are NOT errors: they are the signal the alerts exist for.

import { latencyTier, LATENCY_TIERS, VALID_REFRESH_STATUSES } from "../config/thresholds.js";

const ORPHAN_MARKERS = new Map([
  ["nan", "nan"],
  ["", "empty"],
  ["orphaned_report", "ORPHANED_REPORT"],
  ["null", "null"],
  ["none", "none"],
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

// Rule definitions: id, title, and why. Counts are filled in by cleanRows().
export const RULES = [
  { id: "R1", title: "Unparseable or missing numeric field", action: "Quarantine row", why: "A row we cannot read as numbers cannot be used for cost or latency maths." },
  { id: "R2", title: "Orphaned owner (nan / ORPHANED_REPORT / empty)", action: "Keep row, set owner_email = null, is_orphaned = true", why: "Orphaned reports are a business finding the dashboard must show, so the rows are kept and flagged, not deleted." },
  { id: "R3", title: "Malformed owner email (present but not an email)", action: "Quarantine row", why: "An owner string that is neither a marker nor an email is a data-entry error." },
  { id: "R4", title: "Negative snowflake_credits_consumed", action: "Quarantine row (excluded from cost allocation)", why: "Credits consumed cannot be negative. They are errors or billing adjustments, so they must not reduce a report's cost." },
  { id: "R5", title: "Impossible latency (<= 0 seconds)", action: "Quarantine row", why: "A page cannot load in zero or negative time." },
  { id: "R6", title: "Latency above the 15s alert threshold", action: "Keep row, tag latency_tier (warning/high/critical)", why: "Spikes up to 55s are real events the alerting engine must catch. Removing them would hide the problem." },
  { id: "R7", title: "last_refresh_status = UNKNOWN", action: "Keep row, status_known = false", why: "We cannot tell if the refresh failed, so it is counted separately and excluded from the failure rate." },
  { id: "R8", title: "Unrecognised refresh status value", action: "Quarantine row", why: "Only SUCCESS, FAILED, TIMED_OUT and UNKNOWN are valid." },
  { id: "R9", title: "Zero monthly_active_views", action: "Keep row, has_views = false", why: "Cost-per-view would divide by zero. Flagged so SQL can use NULLIF and the UI can show 'no views'." },
  { id: "R10", title: "Exact duplicate row", action: "Quarantine the later copy", why: "Duplicates double-count cost." },
  { id: "R11", title: "Negative or non-integer count fields", action: "Quarantine row", why: "Views, queries and concurrent users must be non-negative whole numbers." },
  { id: "R12", title: "Negative aws_hosting_cost_usd", action: "Quarantine row", why: "Hosting cost cannot be negative." },
];

export function normaliseOwner(raw) {
  const value = (raw ?? "").trim();
  const marker = ORPHAN_MARKERS.get(value.toLowerCase());
  if (marker !== undefined) return { owner: null, orphaned: true, reason: marker };
  return { owner: value.toLowerCase(), orphaned: false, reason: null };
}

export function cleanRows(rawRows) {
  const counts = Object.fromEntries(RULES.map((r) => [r.id, 0]));
  // "detected" counts how many raw rows show each flag-type issue, even if the row
  // is later quarantined for a different reason. "counts" is what the rule actually did.
  const detected = Object.fromEntries(RULES.map((r) => [r.id, 0]));
  const clean = [];
  const rejected = [];
  const seen = new Set();

  rawRows.forEach((raw, index) => {
    const rowId = index + 2; // +2 = 1-based, plus the header line. Lets anyone find the row in the CSV.
    const reject = (ruleId, detail) => {
      counts[ruleId]++;
      rejected.push({ source_row: rowId, rule: ruleId, detail, ...raw });
    };

    // R10: duplicates (checked on the full raw record)
    const fingerprint = JSON.stringify(raw);
    if (seen.has(fingerprint)) return reject("R10", "identical to an earlier row");
    seen.add(fingerprint);

    const credits = num(raw.snowflake_credits_consumed);
    const latency = num(raw.avg_load_time_sec);
    const views = num(raw.monthly_active_views);
    const aws = num(raw.aws_hosting_cost_usd);
    const queries = num(raw.query_count_last_30d);
    const peak = num(raw.concurrent_user_peak);

    // R1
    const numeric = { credits, latency, views, aws, queries, peak };
    const bad = Object.entries(numeric).filter(([, v]) => !Number.isFinite(v)).map(([k]) => k);
    if (bad.length) return reject("R1", `non-numeric: ${bad.join(", ")}`);

    // Detection pass for flag-type rules (independent of quarantine order)
    if (normaliseOwner(raw.owner_email).orphaned) detected.R2++;
    if (latency > LATENCY_TIERS.warning) detected.R6++;
    if ((raw.last_refresh_status ?? "").trim().toUpperCase() === "UNKNOWN") detected.R7++;
    if (views === 0) detected.R9++;

    // R11
    for (const [name, v] of [["views", views], ["queries", queries], ["peak", peak]]) {
      if (v < 0 || !Number.isInteger(v)) return reject("R11", `${name} = ${v}`);
    }
    // R12
    if (aws < 0) return reject("R12", `aws_hosting_cost_usd = ${aws}`);
    // R4
    if (credits < 0) return reject("R4", `snowflake_credits_consumed = ${credits}`);
    // R5
    if (latency <= 0) return reject("R5", `avg_load_time_sec = ${latency}`);

    // R8
    const status = (raw.last_refresh_status ?? "").trim().toUpperCase();
    if (!VALID_REFRESH_STATUSES.includes(status)) return reject("R8", `status = '${raw.last_refresh_status}'`);

    // R2 / R3
    const { owner, orphaned, reason } = normaliseOwner(raw.owner_email);
    if (!orphaned && !EMAIL_RE.test(owner)) return reject("R3", `owner_email = '${raw.owner_email}'`);
    if (orphaned) counts.R2++;

    const tier = latencyTier(latency);
    if (tier !== "ok") counts.R6++;
    if (status === "UNKNOWN") counts.R7++;
    if (views === 0) counts.R9++;

    clean.push({
      source_row: rowId,
      report_id: raw.report_id.trim(),
      report_name: raw.report_name.trim(),
      owner_email: owner,
      is_orphaned: orphaned,
      orphan_reason: reason,
      refresh_status: status,
      status_known: status !== "UNKNOWN",
      monthly_active_views: views,
      has_views: views > 0,
      snowflake_credits_consumed: credits,
      avg_load_time_sec: latency,
      latency_tier: tier,
      aws_hosting_cost_usd: aws,
      query_count_last_30d: queries,
      concurrent_user_peak: peak,
    });
  });

  // Quarantine rules: detected = rows_affected (first failing rule wins, so a row is quarantined once).
  const flagRules = new Set(["R2", "R6", "R7", "R9"]);
  const log = RULES.map((r) => ({
    ...r,
    detected_in_raw: flagRules.has(r.id) ? detected[r.id] : counts[r.id],
    rows_affected: counts[r.id],
  }));
  return { clean, rejected, log, totals: { input: rawRows.length, clean: clean.length, quarantined: rejected.length } };
}

// One row per report. The CSV has no timestamp, so we assume file order is
// chronological and treat the LAST non-orphan owner as the "latest known owner".
// This assumption is written into the README.
export function summariseReports(cleanRowsList) {
  const byReport = new Map();
  for (const r of cleanRowsList) {
    if (!byReport.has(r.report_id)) byReport.set(r.report_id, []);
    byReport.get(r.report_id).push(r);
  }
  const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
  return [...byReport.entries()].map(([report_id, rows]) => {
    const known = rows.filter((r) => r.status_known);
    const failed = known.filter((r) => r.refresh_status !== "SUCCESS").length;
    const owners = rows.filter((r) => !r.is_orphaned).map((r) => r.owner_email);
    const views = sum(rows, "monthly_active_views");
    const credits = sum(rows, "snowflake_credits_consumed");
    const aws = sum(rows, "aws_hosting_cost_usd");
    return {
      report_id,
      report_name: rows[0].report_name,
      observations: rows.length,
      orphaned_observations: rows.filter((r) => r.is_orphaned).length,
      latest_known_owner: owners.length ? owners[owners.length - 1] : null,
      distinct_owners: new Set(owners).size,
      total_views: views,
      total_credits: Number(credits.toFixed(2)),
      total_aws_cost_usd: Number(aws.toFixed(2)),
      avg_load_time_sec: Number((sum(rows, "avg_load_time_sec") / rows.length).toFixed(2)),
      max_load_time_sec: Math.max(...rows.map((r) => r.avg_load_time_sec)),
      breach_observations: rows.filter((r) => r.latency_tier !== "ok").length,
      refresh_failure_rate: known.length ? Number((failed / known.length).toFixed(4)) : null,
      unknown_status_observations: rows.length - known.length,
      credits_per_view: views > 0 ? Number((credits / views).toFixed(4)) : null,
      aws_cost_per_view: views > 0 ? Number((aws / views).toFixed(4)) : null,
    };
  });
}