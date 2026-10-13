// Real-time channel: one WebSocket per dashboard tab.
//
// Security on the upgrade request (before any data flows):
//   * path must match WS_PATH
//   * Origin must be in CLIENT_ORIGINS when a browser sends one
//     (blocks cross-site WebSocket hijacking)
//   * a valid session (cookie or Bearer token) with alerts:read
// After connecting, every message is filtered with the same row-level rule as
// the REST API, so a report owner only ever receives their own reports' events.
// The socket is closed with code 4001 when the session expires.
import { WebSocketServer, WebSocket } from "ws";
import { env } from "../config/env.js";
import { verifyToken, tokenFromRequest } from "../auth/tokens.js";
import { can, PERMISSIONS } from "../auth/roles.js";
import { canSeeReport } from "../domain/access.js";

const MAX_BUFFERED_BYTES = 1024 * 1024; // skip telemetry to slow clients instead of piling up memory

function rejectUpgrade(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function attachRealtime({ server, store, engine, replay }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });

  const canSee = (user, reportId) => {
    const report = store.reportById(reportId);
    return Boolean(report) && canSeeReport(user, report);
  };

  const send = (ws, message, { droppable = false } = {}) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (droppable && ws.bufferedAmount > MAX_BUFFERED_BYTES) return;
    ws.send(JSON.stringify(message));
  };

  const broadcast = (message, { reportId, droppable } = {}) => {
    for (const ws of wss.clients) {
      if (reportId && !canSee(ws.user, reportId)) continue;
      send(ws, message, { droppable });
    }
  };

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url, "http://localhost");
    if (pathname !== env.ws.path) return rejectUpgrade(socket, 404, "Not Found");

    const origin = req.headers.origin;
    if (origin && !env.clientOrigins.includes(origin)) return rejectUpgrade(socket, 403, "Forbidden");

    const token = tokenFromRequest(req.headers);
    const user = token ? verifyToken(token) : null;
    if (!user) return rejectUpgrade(socket, 401, "Unauthorized");
    if (!can(user, PERMISSIONS.ALERTS_READ)) return rejectUpgrade(socket, 403, "Forbidden");

    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, user));
  });

  wss.on("connection", (ws, user) => {
    ws.user = user;
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });
    ws.on("error", () => {}); // a broken client must never crash the server

    // Clients may only send small JSON pings; anything else is ignored.
    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg?.type === "ping") send(ws, { type: "pong", at: new Date().toISOString() });
    });

    const msLeft = user.expiresAt - Date.now();
    const expiry = setTimeout(() => ws.close(4001, "Session expired"), Math.max(0, msLeft));
    expiry.unref?.();
    ws.on("close", () => clearTimeout(expiry));

    send(ws, {
      type: "hello",
      user: { email: user.email, role: user.role },
      thresholds: { latency: env.latency, cooldown_sec: env.alerts.cooldownSec },
      replay: replay.status(),
      alerts: engine.alerts.filter((a) => canSee(user, a.report_id)).slice(0, 50),
      telemetry: replay.recent.filter((t) => canSee(user, t.report_id)),
    });
  });

  engine.on("alert", (alert) => broadcast({ type: "alert", alert }, { reportId: alert.report_id }));
  engine.on("ack", (alert) => broadcast({ type: "alert_ack", alert }, { reportId: alert.report_id }));
  replay.on("telemetry", (data) => broadcast({ type: "telemetry", data }, { reportId: data.report_id, droppable: true }));
  replay.on("status", (status) => broadcast({ type: "replay_status", status }));

  // Heartbeat: drop connections that stopped answering (closed laptop, lost Wi-Fi).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, env.ws.heartbeatSec * 1000);
  heartbeat.unref?.();

  return {
    wss,
    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.close(1001, "Server shutting down");
      wss.close();
    },
  };
}