// Integration tests for alerts over REST and WebSocket, using the real server assembly.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PASSWORD = "test-password-123";
process.env.NODE_ENV = "test";
process.env.DEMO_PASSWORD = PASSWORD;
process.env.JWT_SECRET = "y".repeat(48);
process.env.REPLAY_AUTOSTART = "false"; // tests drive the replay step by step
process.env.ALERT_COOLDOWN_SEC = "0";
process.env.CLIENT_ORIGINS = "http://localhost:5173";

let bundle;
let port;
const api = (p) => `http://127.0.0.1:${port}/api/v1${p}`;

before(async () => {
  execFileSync(process.execPath, ["src/etl/run.js"], { cwd: serverDir, stdio: "ignore" });
  const { buildServer } = await import("../src/bootstrap.js");
  bundle = buildServer();
  bundle.server.listen(0);
  await new Promise((r) => bundle.server.once("listening", r));
  port = bundle.server.address().port;
});

after(() => bundle?.shutdown());

async function token(email) {
  const res = await fetch(api("/auth/login"), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return (await res.json()).token;
}

// Opens a socket and collects messages. Resolves once "hello" arrives.
function connect(tok, { origin } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (tok) headers.authorization = `Bearer ${tok}`;
    if (origin) headers.origin = origin;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
    const messages = [];
    ws.on("message", (m) => {
      const msg = JSON.parse(m.toString());
      messages.push(msg);
      if (msg.type === "hello") resolve({ ws, messages, hello: msg });
    });
    ws.on("unexpected-response", (req, res) => reject(new Error(String(res.statusCode))));
    ws.on("error", reject);
  });
}

const settle = () => new Promise((r) => setTimeout(r, 150));

test("WebSocket rejects a connection without a session (401)", async () => {
  await assert.rejects(connect(null), /401/);
});

test("WebSocket rejects a foreign Origin (403, cross-site hijacking)", async () => {
  const t = await token("admin@pureinsights.local");
  await assert.rejects(connect(t, { origin: "https://evil.example" }), /403/);
});

test("WebSocket accepts the allowed Origin and sends hello", async () => {
  const t = await token("viewer@pureinsights.local");
  const { ws, hello } = await connect(t, { origin: "http://localhost:5173" });
  assert.equal(hello.user.role, "viewer");
  assert.equal(hello.thresholds.latency.warning, 15);
  assert.ok(Array.isArray(hello.telemetry));
  ws.close();
});

test("alerts are pushed live, and owners only receive their own reports", async () => {
  const admin = await connect(await token("admin@pureinsights.local"));
  const owner = await connect(await token("user_3@company.com"));

  for (let i = 0; i < 300; i++) bundle.replay.step();
  await settle();

  const adminAlerts = admin.messages.filter((m) => m.type === "alert");
  const ownerAlerts = owner.messages.filter((m) => m.type === "alert");
  const ownerTelemetry = owner.messages.filter((m) => m.type === "telemetry");
  assert.ok(adminAlerts.length > 0, "admin received alerts");
  assert.ok(ownerAlerts.length > 0, "owner received some alerts");
  assert.ok(ownerAlerts.length < adminAlerts.length, "owner received fewer alerts");
  const ownReports = new Set(bundle.store.reports.filter((r) => r.latest_known_owner === "user_3@company.com").map((r) => r.report_id));
  assert.ok(ownerAlerts.every((m) => ownReports.has(m.alert.report_id)), "owner never sees other reports");
  assert.ok(ownerTelemetry.every((m) => ownReports.has(m.data.report_id)), "telemetry is filtered too");
  assert.ok(adminAlerts.every((m) => m.alert.type !== "LATENCY_BREACH" || m.alert.value > 15));

  admin.ws.close();
  owner.ws.close();
});

test("acknowledging over REST is broadcast to connected dashboards", async () => {
  const t = await token("analyst@pureinsights.local");
  const live = await connect(t);
  const list = await (await fetch(api("/alerts?status=open&limit=1"), { headers: { authorization: `Bearer ${t}` } })).json();
  const id = list.items[0].id;
  const res = await fetch(api(`/alerts/${id}/ack`), { method: "POST", headers: { authorization: `Bearer ${t}` } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).alert.acknowledged_by, "analyst@pureinsights.local");
  await settle();
  assert.ok(live.messages.some((m) => m.type === "alert_ack" && m.alert.id === id));
  live.ws.close();
});

test("alerts REST: viewer can read but not acknowledge; owner cannot ack others' alerts", async () => {
  const viewer = await token("viewer@pureinsights.local");
  const list = await (await fetch(api("/alerts?limit=5"), { headers: { authorization: `Bearer ${viewer}` } })).json();
  assert.ok(list.total > 0);
  const ack = await fetch(api(`/alerts/${list.items[0].id}/ack`), { method: "POST", headers: { authorization: `Bearer ${viewer}` } });
  assert.equal(ack.status, 403);

  const owner = await token("user_3@company.com");
  const foreign = bundle.engine.alerts.find((a) => a.owner !== "user_3@company.com");
  const res = await fetch(api(`/alerts/${foreign.id}/ack`), { method: "POST", headers: { authorization: `Bearer ${owner}` } });
  assert.equal(res.status, 404);
});

test("alerts REST validates filters and reports stats", async () => {
  const t = await token("admin@pureinsights.local");
  const h = { headers: { authorization: `Bearer ${t}` } };
  assert.equal((await fetch(api("/alerts?severity=apocalyptic"), h)).status, 400);
  assert.equal((await fetch(api("/alerts?limit=9999"), h)).status, 400);
  const crit = await (await fetch(api("/alerts?severity=critical"), h)).json();
  assert.ok(crit.items.every((a) => a.severity === "critical"));
  const stats = await (await fetch(api("/alerts/stats"), h)).json();
  assert.equal(stats.engine.evaluated, 300);
});

test("only admin can start/stop the replay", async () => {
  const analyst = await token("analyst@pureinsights.local");
  const admin = await token("admin@pureinsights.local");
  assert.equal((await fetch(api("/replay/start"), { method: "POST", headers: { authorization: `Bearer ${analyst}` } })).status, 403);
  const started = await (await fetch(api("/replay/start"), { method: "POST", headers: { authorization: `Bearer ${admin}` } })).json();
  assert.equal(started.running, true);
  const stopped = await (await fetch(api("/replay/stop"), { method: "POST", headers: { authorization: `Bearer ${admin}` } })).json();
  assert.equal(stopped.running, false);
});

test("non-JSON and oversized client messages do not crash the server", async () => {
  const { ws } = await connect(await token("admin@pureinsights.local"));
  ws.send("not json");
  ws.send(JSON.stringify({ type: "ping" }));
  const closed = new Promise((r) => ws.once("close", (code) => r(code)));
  ws.send("x".repeat(10 * 1024)); // above maxPayload: server closes this socket only
  assert.equal(await closed, 1009);
  const health = await fetch(api("/health"));
  assert.equal(health.status, 200);
});