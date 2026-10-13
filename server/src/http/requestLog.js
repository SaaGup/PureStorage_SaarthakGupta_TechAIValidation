// One line per request: method, path, status, duration, user. No bodies (they may hold passwords).
export function requestLog(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (process.env.NODE_ENV !== "test") {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms ${req.user?.email ?? "-"}`);
    }
  });
  next();
}