// Single source of truth for alert thresholds.
// The ETL, the WebSocket alert engine and the dashboard all import these,
// so the "15 second" rule from the brief lives in exactly one place.

export const LATENCY_TIERS = {
  warning: 15, // brief: alert whenever load latency exceeds 15 seconds
  high: 30,
  critical: 50,
};

export const VALID_REFRESH_STATUSES = ["SUCCESS", "FAILED", "TIMED_OUT", "UNKNOWN"];

// Returns "ok" | "warning" | "high" | "critical" for a latency in seconds.
export function latencyTier(seconds) {
  if (seconds >= LATENCY_TIERS.critical) return "critical";
  if (seconds >= LATENCY_TIERS.high) return "high";
  if (seconds > LATENCY_TIERS.warning) return "warning";
  return "ok";
}