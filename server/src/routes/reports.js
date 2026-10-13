import { Router } from "express";
import { authenticate, authorize } from "../http/auth.js";
import { PERMISSIONS, can } from "../auth/roles.js";
import { canSeeReport, shapeReport, visibleReports } from "../domain/access.js";
import { parseListQuery, sortAndPage } from "../http/query.js";
import { badRequest, notFound } from "../http/errors.js";

const BASE_SORT = [
  "report_id", "report_name", "total_views", "avg_load_time_sec", "max_load_time_sec",
  "breach_observations", "refresh_failure_rate", "orphaned_observations", "distinct_owners",
];
const COST_SORT = ["total_cost_usd", "cost_per_view_usd", "unowned_cost_usd", "cost_rank"];

export const reportsRouter = (store) => {
  const r = Router();
  r.use(authenticate, authorize(PERMISSIONS.REPORTS_READ_ALL, PERMISSIONS.REPORTS_READ_OWN));

  // GET /reports?search=&ownership=orphaned|owned&sort=&order=&page=&pageSize=
  r.get("/", (req, res) => {
    const sortable = can(req.user, PERMISSIONS.COSTS_READ) ? [...BASE_SORT, ...COST_SORT] : BASE_SORT;
    const q = parseListQuery(req.query, { sortable, defaultSort: "max_load_time_sec" });
    const ownership = req.query.ownership;
    if (ownership && !["orphaned", "owned"].includes(ownership)) throw badRequest("ownership must be orphaned or owned");

    let items = visibleReports(req.user, store.reports);
    if (q.search) {
      items = items.filter((x) =>
        [x.report_id, x.report_name, x.latest_known_owner ?? ""].some((v) => v.toLowerCase().includes(q.search)));
    }
    if (ownership === "orphaned") items = items.filter((x) => x.orphaned_observations > 0);
    if (ownership === "owned") items = items.filter((x) => x.orphaned_observations === 0);
    res.json(sortAndPage(items, q));
  });

  // GET /reports/:id  -> report + its observations (oldest first) for trend charts
  r.get("/:id", (req, res) => {
    const report = store.reports.find((x) => x.report_id === req.params.id);
    // 404 (not 403) for reports you may not see, so IDs of other teams' reports aren't confirmed.
    if (!report || !canSeeReport(req.user, report)) throw notFound(`Report ${req.params.id} not found`);
    const showCost = can(req.user, PERMISSIONS.COSTS_READ);
    const observations = store.observationsFor(report.report_id).map((o) => {
      if (showCost) return o;
      const { snowflake_credits_consumed, aws_hosting_cost_usd, ...rest } = o; // eslint-disable-line no-unused-vars
      return rest;
    });
    res.json({ report: shapeReport(req.user, report), observations });
  });

  return r;
};