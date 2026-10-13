// Dev server: the React app runs on :5173 and forwards /api and /ws to the
// Express server, so the browser sees ONE origin. That keeps the session
// cookie SameSite=Strict and means no CORS is needed in development.
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.API_PROXY_TARGET || "http://localhost:4000";
  return {
    plugins: [react()],
    server: {
      port: Number(env.CLIENT_PORT || 5173),
      strictPort: true,
      proxy: {
        "/api": { target, changeOrigin: false },
        "/ws": { target: target.replace(/^http/, "ws"), ws: true },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: false,
      // The charting library is one large vendor chunk; it is cached separately from app code.
      chunkSizeWarningLimit: 600,
      // Separate long-lived vendor code from app code so browsers cache it between releases
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router"],
            charts: ["recharts"],
          },
        },
      },
    },
  };
});