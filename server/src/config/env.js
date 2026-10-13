// Non-secret runtime settings. Nothing is hard-coded: every value can be set in
// server/.env (git-ignored) or as a real environment variable. Defaults below
// are the documented values from server/.env.example, so a fresh clone runs.
// Secrets live separately in secrets.js, so the ETL never needs them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoDir = path.resolve(serverDir, "..");

// Built into Node (no dotenv dependency). Variables already set in the shell win.
const envFile = path.join(serverDir, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

function number(name, fallback, { min = -Infinity } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be a number >= ${min}, got "${raw}"`);
  return n;
}

// Relative paths in .env are resolved from server/, so they work from any working directory.
const filePath = (name, fallback) => (process.env[name] ? path.resolve(serverDir, process.env[name]) : fallback);

const latency = {
  warning: number("LATENCY_WARNING_SEC", 15, { min: 0 }),
  high: number("LATENCY_HIGH_SEC", 30, { min: 0 }),
  critical: number("LATENCY_CRITICAL_SEC", 50, { min: 0 }),
};
if (!(latency.warning < latency.high && latency.high < latency.critical)) {
  throw new Error("Latency thresholds must satisfy WARNING < HIGH < CRITICAL");
}

const list = (name, fallback) =>
  (process.env[name] || fallback).split(",").map((s) => s.trim()).filter(Boolean);

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  port: number("PORT", 4000, { min: 0 }),
  // Browser origins allowed to call the API (comma-separated)
  clientOrigins: list("CLIENT_ORIGINS", "http://localhost:5173"),
  // Set to true only when running behind a reverse proxy / load balancer
  trustProxy: process.env.TRUST_PROXY === "true",
  // One value drives both the JWT expiry and the cookie lifetime
  sessionTtlHours: number("SESSION_TTL_HOURS", 8, { min: 1 }),
  rateLimit: {
    apiPerMinute: number("RATE_LIMIT_API_PER_MIN", 300, { min: 1 }),
    loginPer15Min: number("RATE_LIMIT_LOGIN_PER_15_MIN", 10, { min: 1 }),
  },
  usdPerCredit: number("USD_PER_CREDIT", 3, { min: 0 }),
  latency,
  rawDataFile: filePath("RAW_DATA_FILE", path.join(repoDir, "data/raw/pure_insights_monitoring.csv")),
  dataDir: filePath("DATA_DIR", path.join(repoDir, "data/processed")),
  docsDir: filePath("DOCS_DIR", path.join(repoDir, "docs")),
  usersFile: filePath("USERS_FILE", path.join(serverDir, "config/users.json")),
};