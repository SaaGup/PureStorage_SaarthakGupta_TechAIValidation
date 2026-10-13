// Demo mode decides whether the login screen is told the password. Each case runs in a
// fresh process because settings are read once at import time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probe = 'import("./src/config/secrets.js").then(({ secrets }) => console.log(JSON.stringify({ demo: secrets.demoMode })))';

function demoMode(vars) {
  // Every variable is set explicitly ("" = unset) so a local server/.env cannot change the result
  const env = { ...process.env, NODE_ENV: "", JWT_SECRET: "", DEMO_PASSWORD: "", PUBLIC_DEMO: "", ...vars };
  const out = execFileSync(process.execPath, ["-e", probe], { cwd: serverDir, env, encoding: "utf8" });
  return JSON.parse(out.trim().split("\n").pop()).demo;
}

const prod = { NODE_ENV: "production", JWT_SECRET: "x".repeat(48) };

test("development with no password chosen is demo mode", () => {
  assert.equal(demoMode({}), true);
});

test("development with a chosen password is not demo mode", () => {
  assert.equal(demoMode({ DEMO_PASSWORD: "someone-chose-this" }), false);
});

test("production is never demo mode by default, even with the public password", () => {
  assert.equal(demoMode({ ...prod, DEMO_PASSWORD: "pureinsights-demo" }), false);
});

test("production opts in to demo mode only with PUBLIC_DEMO=true", () => {
  assert.equal(demoMode({ ...prod, DEMO_PASSWORD: "pureinsights-demo", PUBLIC_DEMO: "true" }), true);
  assert.equal(demoMode({ ...prod, DEMO_PASSWORD: "pureinsights-demo", PUBLIC_DEMO: "yes" }), false);
});

test("PUBLIC_DEMO does not remove the production requirement for secrets", () => {
  assert.throws(() => demoMode({ NODE_ENV: "production", PUBLIC_DEMO: "true" }));
});