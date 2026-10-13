// Thin wrapper around fetch for the /api/v1 endpoints.
// - Sends the session cookie (same origin, so no token is ever stored in JS)
// - Turns the API's { error: { code, message } } shape into a thrown ApiError
// - Broadcasts "session-expired" on 401 so the app can return to the login screen
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const SESSION_EXPIRED_EVENT = "pi:session-expired";

export async function api(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(`/api/v1${path}`, {
    method,
    signal,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(res.status, data?.error?.code ?? "HTTP_ERROR", data?.error?.message ?? `Request failed (${res.status})`);
  }
  return data;
}

// Builds "?a=1&b=2", skipping empty values.
export function query(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}