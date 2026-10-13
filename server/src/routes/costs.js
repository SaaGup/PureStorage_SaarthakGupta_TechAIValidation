import { Router } from "express";
import { authenticate, authorize } from "../http/auth.js";
import { PERMISSIONS } from "../auth/roles.js";
import { canSeeReport } from "../domain/access.js";
import { costSummary } from "../domain/costs.js";
import { parseListQuery, sortAndPage } from "../http/query.js";
import { badRequest } from "../http/errors.js";

const SORTABLE = ["cost_rank", "total_cost_usd", "cost_per_view_usd", "unowned_cost_usd", "aws_cost_usd", "total_views", "report_id"];
const ACTIONS = ["OK", "REVIEW_HOSTING", "OPTIMISE_QUERIES", "NO_VIEWS"];

export const costsRouter = (store) => {
  const r = Router();
  r.use(authenticate, authorize(PERMISSIONS.COSTS_READ));

  const scoped = (user) => {
    const allowed = new Set(store.reports.filter((rep) => canSeeReport(user, rep)).map((rep) => rep.report_id));
    return store.costs.filter((c) => allowed.has(c.report_id));
  };

  r.get("/summary", (req, res) => {
    res.json({ ...costSummary(scoped(req.user)), usd_per_credit_assumption: store.usdPerCredit });
  });

  // GET /costs/reports?action=REVIEW_HOSTING&sort=cost_rank&order=asc
  r.get("/reports", (req, res) => {
    const q = parseListQuery(req.query, { sortable: SORTABLE, defaultSort: "cost_rank", defaultOrder: "asc" });
    let items = scoped(req.user);
    if (req.query.action) {
      if (!ACTIONS.includes(req.query.action)) throw badRequest(`action must be one of: ${ACTIONS.join(", ")}`);
      items = items.filter((c) => c.recommended_action === req.query.action);
    }
    if (q.search) items = items.filter((c) => `${c.report_id} ${c.report_name}`.toLowerCase().includes(q.search));
    res.json(sortAndPage(items, q));
  });

  return r;
};