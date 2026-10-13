// Display formatting. One place, so every number on screen is formatted the same way.

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const missing = (v) => v === null || v === undefined || Number.isNaN(v);

export function money(v, { exact = false } = {}) {
  if (missing(v)) return "–";
  return exact || Math.abs(v) < 100 ? usd2.format(v) : usd0.format(v);
}

// $4.07M, $455K, $812
export function moneyCompact(v) {
  if (missing(v)) return "–";
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`;
  return usd0.format(v);
}

export function number(v) {
  return missing(v) ? "–" : int.format(v);
}

// 0.2961 -> "29.6%"
export function percent(v, digits = 1) {
  return missing(v) ? "–" : `${(v * 100).toFixed(digits)}%`;
}

export function seconds(v) {
  return missing(v) ? "–" : `${Number(v).toFixed(1)}s`;
}

// "just now", "42s ago", "5m ago", "3h ago"
export function timeAgo(iso, now = Date.now()) {
  const diff = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// True for an alert raised in the last few seconds (highlighted when it appears).
export const isFresh = (iso, now = Date.now(), windowMs = 4000) => now - new Date(iso).getTime() < windowMs;

export const SEVERITY_LABEL = { warning: "Warning", high: "High", critical: "Critical" };
export const TIER_LABEL = { ok: "Within target", warning: "Slow", high: "Very slow", critical: "Critical" };
export const STATUS_LABEL = { SUCCESS: "Succeeded", FAILED: "Failed", TIMED_OUT: "Timed out", UNKNOWN: "Unknown" };
export const ACTION_LABEL = {
  OK: "No action",
  REVIEW_HOSTING: "Review hosting",
  OPTIMISE_QUERIES: "Optimise queries",
  NO_VIEWS: "No views",
};
export const ALERT_TYPE_LABEL = { LATENCY_BREACH: "Slow load", REFRESH_FAILURE: "Refresh failure" };