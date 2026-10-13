// Data access layer. Loads the ETL output once at startup and keeps it in memory.
// Routes only call the functions below, so swapping this file for a Snowflake
// client (querying the PI_CORE views) would not change any route.
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { buildReportCosts, addCostInsights, costSummary } from "../domain/costs.js";
import { platformHealth } from "../domain/health.js";

function readJson(file) {
  const full = path.join(env.dataDir, file);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing ${full}. Run "npm run etl" in server/ first.`);
  }
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

export function loadStore() {
  const observations = readJson("observations.json");
  const reports = readJson("reports.json");
  const quality = readJson("data_quality_log.json");

  const costs = addCostInsights(buildReportCosts(observations, env.usdPerCredit));
  const costById = new Map(costs.map((c) => [c.report_id, c]));
  const obsByReport = new Map();
  for (const o of observations) {
    if (!obsByReport.has(o.report_id)) obsByReport.set(o.report_id, []);
    obsByReport.get(o.report_id).push(o);
  }

  // Report rows enriched with cost fields; access.js strips what a user may not see.
  const enriched = reports.map((r) => {
    const c = costById.get(r.report_id) ?? {};
    return {
      ...r,
      total_cost_usd: c.total_cost_usd ?? null,
      unowned_cost_usd: c.unowned_cost_usd ?? null,
      cost_per_view_usd: c.cost_per_view_usd ?? null,
      cost_rank: c.cost_rank ?? null,
      recommended_action: c.recommended_action ?? null,
    };
  });

  return {
    loadedAt: new Date().toISOString(),
    usdPerCredit: env.usdPerCredit,
    reports: enriched,
    observations,
    observationsFor: (id) => obsByReport.get(id) ?? [],
    costs,
    costSummary: costSummary(costs),
    health: platformHealth(observations, reports),
    quality,
  };
}