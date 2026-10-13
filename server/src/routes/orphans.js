import { Router } from "express";
import { authenticate, authorize } from "../http/auth.js";
import { PERMISSIONS } from "../auth/roles.js";

// Reports with at least one orphaned observation, most unowned spend first.
export const orphansRouter = (store) => {
  const r = Router();
  r.get("/", authenticate, authorize(PERMISSIONS.ORPHANS_READ), (req, res) => {
    const items = store.reports
      .filter((x) => x.orphaned_observations > 0)
      .map((x) => ({
        report_id: x.report_id,
        report_name: x.report_name,
        orphaned_observations: x.orphaned_observations,
        observations: x.observations,
        orphaned_share: Number((x.orphaned_observations / x.observations).toFixed(4)),
        latest_known_owner: x.latest_known_owner,
        distinct_owners: x.distinct_owners,
        unowned_cost_usd: x.unowned_cost_usd,
        suggested_owner: x.latest_known_owner, // reassign to the most recent accountable owner
      }))
      .sort((a, b) => b.unowned_cost_usd - a.unowned_cost_usd);
    res.json({
      reports_affected: items.length,
      orphaned_observations: items.reduce((a, x) => a + x.orphaned_observations, 0),
      unowned_cost_usd: store.costSummary.unowned_cost_usd,
      items,
    });
  });
  return r;
};