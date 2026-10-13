// One error shape for the whole API: { error: { code, message } }

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg) => new ApiError(400, "BAD_REQUEST", msg);
export const unauthorized = (msg = "Authentication required") => new ApiError(401, "UNAUTHORIZED", msg);
export const forbidden = (msg = "You do not have permission for this resource") => new ApiError(403, "FORBIDDEN", msg);
export const notFound = (msg = "Not found") => new ApiError(404, "NOT_FOUND", msg);

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}

// Express 5 forwards errors thrown in async handlers here automatically.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Malformed JSON body" } });
  }
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Unexpected server error" } });
}