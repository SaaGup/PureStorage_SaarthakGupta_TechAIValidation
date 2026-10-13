// Alert thresholds and valid statuses. The numbers come from config (env.js),
// so the ETL, the alert engine and the API always use the same values.
import { env } from "./env.js";

export const LATENCY_TIERS = env.latency;

export const VALID_REFRESH_STATUSES = ["SUCCESS", "FAILED", "TIMED_OUT", "UNKNOWN"];

// Returns "ok" | "warning" | "high" | "critical" for a latency in seconds.
export function latencyTier(seconds, tiers = LATENCY_TIERS) {
  if (seconds >= tiers.critical) return "critical";
  if (seconds >= tiers.high) return "high";
  if (seconds > tiers.warning) return "warning";
  return "ok";
}