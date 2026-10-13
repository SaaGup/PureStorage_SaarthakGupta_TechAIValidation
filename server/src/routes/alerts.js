import { Router } from "express";
import { authenticate, authorize } from "../http/auth.js";
import { PERMISSIONS } from "../auth/roles.js";
import { canSeeReport } from "../domain/access.js";
import { badRequest, notFound } from "../http/errors.js";

const STATUSES = ["open", "acknowledged", "all"];
const SEVERITIES = ["warning", "high", "critical"];
const TYPES = ["LATENCY_BREACH", "REFRESH_FAILURE"];

export const alertsRouter = ({ store, engine }) => {
  const r = Router();
  r.use(authenticate);

  const visible = (user) =>
    engine.alerts.filter((a) => {
      const report = store.reportById(a.report_id);
      return report && canSeeReport(user, report);
    });

  // GET /alerts?status=open&severity=critical&type=LATENCY_BREACH&limit=100
  r.get("/", authorize(PERMISSIONS.ALERTS_READ), (req, res) => {
    const status = req.query.status ?? "all";
    const limit = Number(req.query.limit ?? 100);
    if (!STATUSES.includes(status)) throw badRequest(`status must be one of: ${STATUSES.join(", ")}`);
    if (req.query.severity && !SEVERITIES.includes(req.query.severity)) throw badRequest(`severity must be one of: ${SEVERITIES.join(", ")}`);
    if (req.query.type && !TYPES.includes(req.query.type)) throw badRequest(`type must be one of: ${TYPES.join(", ")}`);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw badRequest("limit must be 1-500");

    let items = visible(req.user);
    if (status === "open") items = items.filter((a) => !a.acknowledged);
    if (status === "acknowledged") items = items.filter((a) => a.acknowledged);
    if (req.query.severity) items = items.filter((a) => a.severity === req.query.severity);
    if (req.query.type) items = items.filter((a) => a.type === req.query.type);
    res.json({ total: items.length, items: items.slice(0, limit) });
  });

  // GET /alerts/stats -> counts for the dashboard badges
  r.get("/stats", authorize(PERMISSIONS.ALERTS_READ), (req, res) => {
    const items = visible(req.user);
    const count = (fn) => items.filter(fn).length;
    res.json({
      total: items.length,
      open: count((a) => !a.acknowledged),
      by_severity: Object.fromEntries(SEVERITIES.map((s) => [s, count((a) => a.severity === s && !a.acknowledged)])),
      by_type: Object.fromEntries(TYPES.map((t) => [t, count((a) => a.type === t)])),
      engine: engine.stats,
    });
  });

  // POST /alerts/:id/ack
  r.post("/:id/ack", authorize(PERMISSIONS.ALERTS_ACK), (req, res) => {
    const alert = engine.find(req.params.id);
    const report = alert && store.reportById(alert.report_id);
    if (!alert || !report || !canSeeReport(req.user, report)) throw notFound("Alert not found");
    res.json({ alert: engine.acknowledge(alert.id, req.user.email) });
  });

  return r;
};

export const replayRouter = ({ replay }) => {
  const r = Router();
  r.use(authenticate);
  r.get("/", authorize(PERMISSIONS.ALERTS_READ), (req, res) => res.json(replay.status()));
  r.post("/start", authorize(PERMISSIONS.REPLAY_CONTROL), (req, res) => res.json(replay.start()));
  r.post("/stop", authorize(PERMISSIONS.REPLAY_CONTROL), (req, res) => res.json(replay.stop()));
  return r;
};