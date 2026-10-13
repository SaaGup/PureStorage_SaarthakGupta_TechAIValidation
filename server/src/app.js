// Builds the Express app. Kept separate from server.js so tests can start it
// on a random port without opening the WebSocket server or real ports.
import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { secrets } from "./config/secrets.js";
import { requestLog } from "./http/requestLog.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { authRouter } from "./routes/auth.js";
import { overviewRouter } from "./routes/overview.js";
import { reportsRouter } from "./routes/reports.js";
import { costsRouter } from "./routes/costs.js";
import { orphansRouter } from "./routes/orphans.js";
import { qualityRouter } from "./routes/quality.js";

export function createApp({ store, extraRoutes = [] }) {
  const app = express();
  app.disable("x-powered-by");
  if (env.trustProxy) app.set("trust proxy", 1); // only when running behind a reverse proxy
  app.use(helmet());
  // Only the configured dashboard origin(s) may call the API from a browser.
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(
    "/api/",
    rateLimit({
      windowMs: 60 * 1000,
      limit: env.rateLimit.apiPerMinute,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skip: () => process.env.NODE_ENV === "test",
      message: { error: { code: "RATE_LIMITED", message: "Too many requests. Slow down." } },
    }),
  );
  app.use(express.json({ limit: "10kb" }));
  app.use(requestLog);

    // Public liveness probe for load balancers / uptime checks.
  // In demo mode it also tells the login screen the (already public) demo password,
  // so reviewers can sign in with one click. A password someone chose is never sent.
  app.get("/api/v1/health", (req, res) => {
    const body = { status: "ok", uptime_sec: Math.round(process.uptime()), data_loaded_at: store.loadedAt };
    if (secrets.demoMode) body.demo = { password: secrets.demoPassword };
    res.json(body);
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/overview", overviewRouter(store));
  app.use("/api/v1/reports", reportsRouter(store));
  app.use("/api/v1/costs", costsRouter(store));
  app.use("/api/v1/orphans", orphansRouter(store));
  app.use("/api/v1/quality", qualityRouter(store));
  for (const [route, router] of extraRoutes) app.use(route, router);

  // Production: serve the built dashboard from the same origin as the API, so the
  // session cookie stays SameSite=Strict and no CORS is needed. Unknown non-API
  // paths return index.html so client-side routes like /reports/RPT_200 work on refresh.
  const indexHtml = path.join(env.clientDistDir, "index.html");
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(env.clientDistDir, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
      res.sendFile(indexHtml);
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}