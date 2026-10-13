// Wires every part together. Used by server.js (real run) and by the tests,
// so the tests exercise exactly the same assembly as production.
import http from "node:http";
import { env } from "./config/env.js";
import { loadStore } from "./data/store.js";
import { createApp } from "./app.js";
import { AlertEngine } from "./alerts/engine.js";
import { ReplaySimulator } from "./alerts/replay.js";
import { alertsRouter, replayRouter } from "./routes/alerts.js";
import { attachRealtime } from "./realtime/ws.js";

export function buildServer() {
  const store = loadStore();
  const engine = new AlertEngine({
    cooldownSec: env.alerts.cooldownSec,
    bufferSize: env.alerts.bufferSize,
    latencyTiers: env.latency,
  });
  const replay = new ReplaySimulator({
    observations: store.observations,
    ownerOf: (id) => store.reportById(id)?.latest_known_owner ?? null,
    engine,
    intervalMs: env.replay.intervalMs,
    loop: env.replay.loop,
  });
  const app = createApp({
    store,
    extraRoutes: [
      ["/api/v1/alerts", alertsRouter({ store, engine })],
      ["/api/v1/replay", replayRouter({ replay })],
    ],
  });
  const server = http.createServer(app);
  const realtime = attachRealtime({ server, store, engine, replay });

  const shutdown = () =>
    new Promise((resolve) => {
      replay.stop();
      realtime.close();
      server.close(() => resolve());
      server.closeAllConnections?.();
    });

  return { store, engine, replay, server, realtime, shutdown };
}