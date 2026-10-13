// Platform-wide operational KPIs, computed from clean observations.
import { round, safeDivide } from "./stats.js";

export function platformHealth(observations, reports) {
  const known = observations.filter((o) => o.status_known);
  const failed = known.filter((o) => o.refresh_status !== "SUCCESS");
  const tiers = { ok: 0, warning: 0, high: 0, critical: 0 };
  const statuses = { SUCCESS: 0, FAILED: 0, TIMED_OUT: 0, UNKNOWN: 0 };
  for (const o of observations) {
    tiers[o.latency_tier]++;
    statuses[o.refresh_status]++;
  }
  const latencies = observations.map((o) => o.avg_load_time_sec);
  return {
    reports: reports.length,
    observations: observations.length,
    refresh_failure_rate: round(safeDivide(failed.length, known.length), 4),
    unknown_status_observations: statuses.UNKNOWN,
    refresh_status_breakdown: statuses,
    latency_tier_breakdown: tiers,
    latency_breach_rate: round(safeDivide(observations.length - tiers.ok, observations.length), 4),
    avg_load_time_sec: round(latencies.reduce((a, x) => a + x, 0) / latencies.length, 2),
    max_load_time_sec: Math.max(...latencies),
    orphaned_observations: observations.filter((o) => o.is_orphaned).length,
    reports_with_orphaned_observations: reports.filter((r) => r.orphaned_observations > 0).length,
  };
}