import { verifyToken, tokenFromRequest } from "../auth/tokens.js";
import { can } from "../auth/roles.js";
import { unauthorized, forbidden } from "./errors.js";

// 401 = we don't know who you are. 403 = we know, and the answer is no.
export function authenticate(req, res, next) {
  const token = tokenFromRequest(req.headers);
  if (!token) throw unauthorized();
  const user = verifyToken(token);
  if (!user) throw unauthorized("Invalid or expired session");
  req.user = user;
  next();
}

// Passes if the user has ANY of the listed permissions.
export const authorize = (...permissions) => (req, res, next) => {
  if (!permissions.some((p) => can(req.user, p))) throw forbidden();
  next();
};