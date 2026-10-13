// Row-level and field-level security, applied to every report the API returns.
import { can, PERMISSIONS } from "../auth/roles.js";

export const COST_FIELDS = [
  "total_credits", "total_aws_cost_usd", "credits_per_view", "aws_cost_per_view",
  "total_cost_usd", "unowned_cost_usd", "cost_per_view_usd", "cost_rank", "recommended_action",
];

// Row level: owners only see reports where they are the latest known owner.
export function canSeeReport(user, report) {
  if (can(user, PERMISSIONS.REPORTS_READ_ALL)) return true;
  if (can(user, PERMISSIONS.REPORTS_READ_OWN)) return report.latest_known_owner === user.email;
  return false;
}

// Field level: users without costs:read get the report without any money fields.
export function shapeReport(user, report) {
  if (can(user, PERMISSIONS.COSTS_READ)) return report;
  const copy = { ...report };
  for (const f of COST_FIELDS) delete copy[f];
  return copy;
}

export const visibleReports = (user, reports) =>
  reports.filter((r) => canSeeReport(user, r)).map((r) => shapeReport(user, r));