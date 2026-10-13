// Secrets. Imported only by the auth modules, never by the ETL.
// Production: missing secrets stop the server at startup (fail fast, not at first login).
// Development: a random per-process JWT secret is generated, and if no DEMO_PASSWORD
// is set the public, documented demo password below is used ("demo mode"), so a
// reviewer can clone and sign in without any setup. Demo mode never runs in production.
import crypto from "node:crypto";
import { env } from "./env.js";

// Public by design: it is printed in the README and only ever used in development.
export const DEFAULT_DEMO_PASSWORD = "pureinsights-demo";

function secret(name, devFallback) {
  const value = process.env[name];
  if (value) return value;
  if (env.isProduction) throw new Error(`Missing required secret ${name} (see server/.env.example)`);
  return devFallback;
}

const jwtSecret = secret("JWT_SECRET", crypto.randomBytes(32).toString("hex"));
if (jwtSecret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");

const demoPassword = secret("DEMO_PASSWORD", DEFAULT_DEMO_PASSWORD);

export const secrets = {
  jwtSecret,
  jwtSecretIsGenerated: !process.env.JWT_SECRET,
  demoPassword,
  // True only when nobody chose a password and we're not in production
  demoMode: !env.isProduction && demoPassword === DEFAULT_DEMO_PASSWORD,
};