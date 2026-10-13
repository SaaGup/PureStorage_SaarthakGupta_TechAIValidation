import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { secrets } from "../config/secrets.js";
import { permissionsFor } from "./roles.js";

export const COOKIE_NAME = "pi_session";

// The token carries identity and role only. Permissions are looked up again
// on every request, so a role change takes effect without waiting for expiry.
export function signToken(user) {
  return jwt.sign({ sub: user.email, name: user.name, role: user.role }, secrets.jwtSecret, {
    algorithm: "HS256",
    expiresIn: env.sessionTtlHours * 3600, // seconds
  });
}

// Returns the request user, or null if the token is missing, forged or expired.
// The algorithm is pinned so a token signed with "none" or another algorithm is rejected.
export function verifyToken(token) {
  try {
    const claims = jwt.verify(token, secrets.jwtSecret, { algorithms: ["HS256"] });
    return {
      email: claims.sub,
      name: claims.name,
      role: claims.role,
      permissions: permissionsFor(claims.role),
      expiresAt: claims.exp * 1000, // used to close WebSockets when the session ends
    };
  } catch {
    return null;
  }
}

// Session cookie: httpOnly (page scripts cannot read it, so XSS cannot steal it),
// SameSite=Strict (not sent on cross-site requests, which blocks CSRF),
// Secure in production (HTTPS only).
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: env.isProduction,
    path: "/",
    maxAge: env.sessionTtlHours * 3600 * 1000, // milliseconds, same lifetime as the token
  };
}

// Reads one cookie from a raw Cookie header (used by HTTP and WebSocket auth).
export function readCookie(header, name) {
  for (const part of String(header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

// Token from the session cookie (browser) or an Authorization: Bearer header (API clients).
export function tokenFromRequest(headers) {
  const [scheme, bearer] = String(headers.authorization ?? "").split(" ");
  if (scheme === "Bearer" && bearer) return bearer;
  return readCookie(headers.cookie, COOKIE_NAME);
}