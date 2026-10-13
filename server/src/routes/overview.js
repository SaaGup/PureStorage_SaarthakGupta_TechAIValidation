import { Router } from "express";
import { authenticate } from "../http/auth.js";
import { can, PERMISSIONS } from "../auth/roles.js";
import { canSeeReport } from "../domain/access.js";
import { platformHealth } from "../domain/health.js";
import { costSummary } from "../domain/costs.js";

// Headline KPIs, scoped to what the user is allowed to see.
export const overviewRouter = (store) => {
  const r = Router();
  r.get("/", authenticate, (req, res) => {
    const seesAll = can(req.user, PERMISSIONS.REPORTS_READ_ALL);
    const reports = seesAll ? store.reports : store.reports.filter((rep) => canSeeReport(req.user, rep));
    const ids = new Set(reports.map((rep) => rep.report_id));
    const health = seesAll
      ? store.health
      : platformHealth(store.observations.filter((o) => ids.has(o.report_id)), reports);

    const body = { scope: seesAll ? "platform" : "own_reports", dataLoadedAt: store.loadedAt, health };
    if (can(req.user, PERMISSIONS.COSTS_READ)) {
      const summary = seesAll ? store.costSummary : costSummary(store.costs.filter((c) => ids.has(c.report_id)));
      body.costs = { ...summary, usd_per_credit_assumption: store.usdPerCredit }; // copy: never mutate shared data
    }
    res.json(body);
  });
  return r;
};