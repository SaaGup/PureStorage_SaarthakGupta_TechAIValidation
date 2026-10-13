// Secrets. Imported only by the auth modules, never by the ETL.
// Production: missing secrets stop the server at startup (fail fast, not at first login).
// Development: a random per-process JWT secret is generated so a fresh clone runs;
// the demo password must still be set in server/.env to enable logins.
import crypto from "node:crypto";
import { env } from "./env.js";

function secret(name, devFallback) {
  const value = process.env[name];
  if (value) return value;
  if (env.isProduction) throw new Error(`Missing required secret ${name} (see server/.env.example)`);
  return devFallback;
}

const jwtSecret = secret("JWT_SECRET", crypto.randomBytes(32).toString("hex"));
if (jwtSecret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");

export const secrets = {
  jwtSecret,
  jwtSecretIsGenerated: !process.env.JWT_SECRET,
  demoPassword: secret("DEMO_PASSWORD", null),
};