// Entry point: node src/server.js
import http from "node:http";
import { env } from "./config/env.js";
import { secrets } from "./config/secrets.js";
import { loadStore } from "./data/store.js";
import { createApp } from "./app.js";

const store = loadStore();
const app = createApp({ store });
const server = http.createServer(app);

server.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}/api/v1`);
  console.log(`Loaded ${store.reports.length} reports, ${store.observations.length} observations`);
  if (secrets.jwtSecretIsGenerated) console.warn("JWT_SECRET not set: using a temporary secret (logins reset on restart)");
});

// Log anything unexpected instead of dying silently
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));

// Close cleanly on Ctrl+C / container stop
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref(); // don't hang on open connections
  });
}