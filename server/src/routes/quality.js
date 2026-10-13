import { Router } from "express";
import { authenticate, authorize } from "../http/auth.js";
import { PERMISSIONS } from "../auth/roles.js";

// The data quality log produced by the ETL: what was flagged or quarantined, and why.
export const qualityRouter = (store) => {
  const r = Router();
  r.get("/", authenticate, authorize(PERMISSIONS.QUALITY_READ), (req, res) => {
    res.json(store.quality);
  });
  return r;
};