// Entry point: node src/server.js
import { env } from "./config/env.js";
import { secrets } from "./config/secrets.js";
import { buildServer } from "./bootstrap.js";

const { store, replay, server, shutdown } = buildServer();

server.listen(env.port, () => {
  console.log(`API       http://localhost:${env.port}/api/v1`);
  console.log(`WebSocket ws://localhost:${env.port}${env.ws.path}`);
  console.log(`Loaded ${store.reports.length} reports, ${store.observations.length} observations`);
  if (secrets.jwtSecretIsGenerated) console.warn("JWT_SECRET not set: using a temporary secret (logins reset on restart)");
  if (secrets.demoMode) console.log(`Demo mode: sign in with any account in config/users.json and the password "${secrets.demoPassword}"`);
  if (env.replay.autostart) {
    replay.start();
    console.log(`Telemetry replay started (one observation every ${env.replay.intervalMs} ms)`);
  }
});

// A clear message instead of a stack trace for the most common startup problem
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${env.port} is already in use. Stop the other process or set PORT in server/.env.`);
    process.exit(1);
  }
  throw err;
});

// Log anything unexpected instead of dying silently
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));

// Close cleanly on Ctrl+C / container stop
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    setTimeout(() => process.exit(0), 5000).unref(); // never hang
    await shutdown();
    process.exit(0);
  });
}