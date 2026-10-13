// Cost model. Mirrors sql/04_cost_allocation.sql and sql/05_rankings_and_flags.sql
// so the API and the warehouse give the same numbers (checked by scripts/verify_sql.py).
import { percentileCont, round, safeDivide } from "./stats.js";

export function buildReportCosts(observations, usdPerCredit) {
  const byReport = new Map();
  for (const o of observations) {
    // Defence in depth, same as PI_CORE.V_ATTRIBUTABLE_USAGE
    if (o.snowflake_credits_consumed < 0 || o.avg_load_time_sec <= 0) continue;
    const r = byReport.get(o.report_id) ?? {
      report_id: o.report_id, report_name: o.report_name,
      views: 0, queries: 0, credits: 0, aws: 0, orphanCredits: 0, orphanAws: 0,
    };
    r.views += o.monthly_active_views;
    r.queries += o.query_count_last_30d;
    r.credits += o.snowflake_credits_consumed;
    r.aws += o.aws_hosting_cost_usd;
    if (o.is_orphaned) {
      r.orphanCredits += o.snowflake_credits_consumed;
      r.orphanAws += o.aws_hosting_cost_usd;
    }
    byReport.set(o.report_id, r);
  }

  const rows = [...byReport.values()];
  const totalCredits = rows.reduce((a, r) => a + r.credits, 0);

  return rows.map((r) => {
    const totalCost = r.credits * usdPerCredit + r.aws;
    return {
      report_id: r.report_id,
      report_name: r.report_name,
      total_views: r.views,
      total_queries: r.queries,
      total_credits: round(r.credits, 4),
      snowflake_cost_usd: round(r.credits * usdPerCredit, 2),
      aws_cost_usd: round(r.aws, 2),
      total_cost_usd: round(totalCost, 2),
      unowned_cost_usd: round(r.orphanCredits * usdPerCredit + r.orphanAws, 2),
      credits_per_view: round(safeDivide(r.credits, r.views), 6),
      cost_per_view_usd: round(safeDivide(totalCost, r.views), 4),
      credits_per_query: round(safeDivide(r.credits, r.queries), 6),
      credit_share: round(safeDivide(r.credits, totalCredits), 6),
    };
  });
}

export function addCostInsights(costs) {
  const cpv = costs.map((c) => c.cost_per_view_usd);
  const b = {
    cpvP25: percentileCont(cpv, 0.25),
    cpvP75: percentileCont(cpv, 0.75),
    awsP75: percentileCont(costs.map((c) => c.aws_cost_usd), 0.75),
    viewsP25: percentileCont(costs.map((c) => c.total_views), 0.25),
  };
  const outlierLimit = b.cpvP75 + 1.5 * (b.cpvP75 - b.cpvP25);
  const grandTotal = costs.reduce((a, c) => a + c.total_cost_usd, 0);

  const ranked = [...costs].sort((x, y) => y.total_cost_usd - x.total_cost_usd || x.report_id.localeCompare(y.report_id));
  let running = 0;
  return ranked.map((c, i) => {
    running += c.total_cost_usd;
    const outlier = c.cost_per_view_usd !== null && c.cost_per_view_usd > outlierLimit;
    const mismatch = c.aws_cost_usd >= b.awsP75 && c.total_views <= b.viewsP25;
    let action = "OK";
    if (c.total_views === 0) action = "NO_VIEWS";
    else if (mismatch) action = "REVIEW_HOSTING";
    else if (outlier) action = "OPTIMISE_QUERIES";
    return {
      ...c,
      cost_rank: i + 1,
      cumulative_cost_share: round(running / grandTotal, 4),
      is_cost_per_view_outlier: outlier,
      is_aws_usage_mismatch: mismatch,
      recommended_action: action,
    };
  });
}

export function costSummary(costs) {
  const sum = (k) => costs.reduce((a, c) => a + c[k], 0);
  const total = sum("total_cost_usd");
  const unowned = sum("unowned_cost_usd");
  return {
    reports: costs.length,
    total_views: sum("total_views"),
    total_credits: round(sum("total_credits"), 2),
    snowflake_cost_usd: round(sum("snowflake_cost_usd"), 2),
    aws_cost_usd: round(sum("aws_cost_usd"), 2),
    total_cost_usd: round(total, 2),
    unowned_cost_usd: round(unowned, 2),
    unowned_cost_share: round(safeDivide(unowned, total), 4),
    platform_cost_per_view_usd: round(safeDivide(total, sum("total_views")), 4),
  };
}