// API integration tests: start the real app on a random port and call it over HTTP.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PASSWORD = "test-password-123";

// Configure the environment BEFORE the app modules load (they read it at import time).
process.env.NODE_ENV = "test";
process.env.DEMO_PASSWORD = PASSWORD;
process.env.JWT_SECRET = "x".repeat(48);

let server;
let base;

before(async () => {
  // Make sure the ETL output exists (cross-platform, no shell needed)
  execFileSync(process.execPath, ["src/etl/run.js"], { cwd: serverDir, stdio: "ignore" });
  const { loadStore } = await import("../src/data/store.js");
  const { createApp } = await import("../src/app.js");
  server = createApp({ store: loadStore() }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(() => server?.close());

async function call(pathname, { token, method = "GET", body, cookie } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  const res = await fetch(base + pathname, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

const tokens = {};
async function login(email) {
  if (!tokens[email]) {
    const r = await call("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
    assert.equal(r.status, 200, `login failed for ${email}`);
    tokens[email] = r.body.token;
  }
  return tokens[email];
}
const ADMIN = "admin@pureinsights.local";
const ANALYST = "analyst@pureinsights.local";
const OWNER = "user_3@company.com";
const VIEWER = "viewer@pureinsights.local";

// ---------- Authentication ----------
test("health endpoint is public", async () => {
  const r = await call("/health");
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "ok");
});

test("health never exposes a password that someone chose", async () => {
  const r = await call("/health");
  assert.equal(r.body.demo, undefined); // tests run with a custom DEMO_PASSWORD
});

test("login sets an httpOnly, SameSite=Strict session cookie", async () => {
  const r = await call("/auth/login", { method: "POST", body: { email: ADMIN, password: PASSWORD } });
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie");
  assert.match(cookie, /pi_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  // The cookie alone authenticates the next request
  const me = await call("/auth/me", { cookie: cookie.split(";")[0] });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, "admin");
});

test("wrong password and unknown email give the same 401", async () => {
  const a = await call("/auth/login", { method: "POST", body: { email: ADMIN, password: "nope" } });
  const b = await call("/auth/login", { method: "POST", body: { email: "ghost@x.com", password: "nope" } });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.deepEqual(a.body, b.body);
});

test("login validates its input", async () => {
  assert.equal((await call("/auth/login", { method: "POST", body: {} })).status, 400);
  assert.equal((await call("/auth/login", { method: "POST", body: { email: 1, password: [] } })).status, 400);
});

test("protected routes need a valid token", async () => {
  assert.equal((await call("/reports")).status, 401);
  assert.equal((await call("/reports", { token: "not.a.jwt" })).status, 401);
});

test("a token signed with a different secret is rejected", async () => {
  const jwt = (await import("jsonwebtoken")).default;
  const forged = jwt.sign({ sub: ADMIN, role: "admin" }, "attacker-secret-attacker-secret-1234");
  assert.equal((await call("/reports", { token: forged })).status, 401);
});

test("an unsigned (alg=none) token is rejected", async () => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const none = `${enc({ alg: "none", typ: "JWT" })}.${enc({ sub: ADMIN, role: "admin" })}.`;
  assert.equal((await call("/reports", { token: none })).status, 401);
});

test("logout clears the cookie", async () => {
  const r = await call("/auth/logout", { method: "POST" });
  assert.equal(r.status, 204);
  assert.match(r.headers.get("set-cookie"), /pi_session=;/);
});

// ---------- RBAC: endpoint level ----------
test("viewer cannot access costs, orphans or quality (403)", async () => {
  const t = await login(VIEWER);
  for (const p of ["/costs/summary", "/costs/reports", "/orphans", "/quality"]) {
    assert.equal((await call(p, { token: t })).status, 403, p);
  }
});

test("analyst can access costs, orphans and quality", async () => {
  const t = await login(ANALYST);
  for (const p of ["/costs/summary", "/costs/reports", "/orphans", "/quality"]) {
    assert.equal((await call(p, { token: t })).status, 200, p);
  }
});

test("owner cannot see orphans or quality", async () => {
  const t = await login(OWNER);
  assert.equal((await call("/orphans", { token: t })).status, 403);
  assert.equal((await call("/quality", { token: t })).status, 403);
});

// ---------- RBAC: field level ----------
test("viewer sees reports but no cost fields", async () => {
  const t = await login(VIEWER);
  const r = await call("/reports?pageSize=100", { token: t });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 100);
  for (const rep of r.body.items) {
    assert.equal(rep.total_cost_usd, undefined);
    assert.equal(rep.total_credits, undefined);
  }
  const detail = await call(`/reports/${r.body.items[0].report_id}`, { token: t });
  assert.equal(detail.body.observations[0].snowflake_credits_consumed, undefined);
  const ov = await call("/overview", { token: t });
  assert.equal(ov.body.costs, undefined);
});

test("viewer cannot sort by a cost field", async () => {
  const t = await login(VIEWER);
  assert.equal((await call("/reports?sort=total_cost_usd", { token: t })).status, 400);
});

// ---------- RBAC: row level ----------
test("owner sees only their own reports", async () => {
  const t = await login(OWNER);
  const r = await call("/reports?pageSize=100", { token: t });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 11);
  assert.ok(r.body.items.every((x) => x.latest_known_owner === OWNER));
  const costs = await call("/costs/reports?pageSize=100", { token: t });
  assert.equal(costs.body.total, 11);
  const ov = await call("/overview", { token: t });
  assert.equal(ov.body.scope, "own_reports");
  assert.equal(ov.body.health.reports, 11);
});

test("owner gets 404 (not 403) for someone else's report", async () => {
  const admin = await login(ADMIN);
  const all = await call("/reports?pageSize=100", { token: admin });
  const other = all.body.items.find((x) => x.latest_known_owner !== OWNER);
  const t = await login(OWNER);
  assert.equal((await call(`/reports/${other.report_id}`, { token: t })).status, 404);
});

// ---------- Data correctness (matches the SQL suite) ----------
test("cost summary matches the reconciled SQL totals", async () => {
  const t = await login(ADMIN);
  const s = (await call("/costs/summary", { token: t })).body;
  assert.equal(s.reports, 100);
  assert.equal(s.total_views, 1486905);
  assert.equal(s.total_credits, 1206352.48);
  assert.equal(s.total_cost_usd, 4074285.31);
  assert.equal(s.unowned_cost_usd, 479753.6);
  assert.equal(s.platform_cost_per_view_usd, 2.7401);
});

test("cost flags match the SQL suite (8 REVIEW_HOSTING, 2 OPTIMISE_QUERIES)", async () => {
  const t = await login(ADMIN);
  const hosting = await call("/costs/reports?action=REVIEW_HOSTING&pageSize=100", { token: t });
  const queries = await call("/costs/reports?action=OPTIMISE_QUERIES&pageSize=100", { token: t });
  assert.equal(hosting.body.total, 8);
  assert.equal(queries.body.total, 2);
  assert.ok(queries.body.items.some((x) => x.report_id === "RPT_295"));
});

test("overview health excludes UNKNOWN from the failure rate", async () => {
  const t = await login(ADMIN);
  const h = (await call("/overview", { token: t })).body.health;
  assert.equal(h.observations, 1976);
  assert.equal(h.unknown_status_observations, 98);
  const s = h.refresh_status_breakdown;
  assert.equal(h.refresh_failure_rate, Number(((s.FAILED + s.TIMED_OUT) / (h.observations - s.UNKNOWN)).toFixed(4)));
});

// ---------- Input validation ----------
test("list endpoints reject bad paging and sorting", async () => {
  const t = await login(ADMIN);
  for (const q of ["page=0", "pageSize=1000", "sort=password", "order=sideways", "ownership=maybe"]) {
    assert.equal((await call(`/reports?${q}`, { token: t })).status, 400, q);
  }
  assert.equal((await call("/costs/reports?action=DROP_TABLE", { token: t })).status, 400);
});

test("pagination and search work", async () => {
  const t = await login(ADMIN);
  const p2 = await call("/reports?page=2&pageSize=10&sort=report_id&order=asc", { token: t });
  assert.equal(p2.body.items.length, 10);
  assert.equal(p2.body.items[0].report_id, "RPT_210");
  const s = await call("/reports?search=dashboard%2042", { token: t });
  assert.equal(s.body.items[0].report_name, "Analytics Dashboard 42");
});

test("unknown routes return a JSON 404, malformed JSON a 400", async () => {
  const r = await call("/nope");
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, "NOT_FOUND");
  const res = await fetch(base + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{bad" });
  assert.equal(res.status, 400);
});

test("security headers are set and the framework is not advertised", async () => {
  const r = await call("/health");
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
});