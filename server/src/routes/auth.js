import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { findUser } from "../auth/users.js";
import { signToken, sessionCookieOptions, COOKIE_NAME } from "../auth/tokens.js";
import { permissionsFor } from "../auth/roles.js";
import { authenticate } from "../http/auth.js";
import { badRequest, unauthorized } from "../http/errors.js";
import { env } from "../config/env.js";

export const authRouter = Router();

// Slows down password guessing: RATE_LIMIT_LOGIN_PER_15_MIN attempts per 15 minutes per IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.rateLimit.loginPer15Min,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." } },
});

// A real hash of a random string, compared when the email is unknown, so a wrong
// email takes as long as a wrong password (no timing hint about which accounts exist).
const DUMMY_HASH = bcrypt.hashSync(String(Math.random()), 10);

const publicUser = (u) => ({ email: u.email, name: u.name, role: u.role, permissions: permissionsFor(u.role) });

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    throw badRequest("email and password are required");
  }
  if (email.length > 320 || password.length > 200) throw badRequest("email or password too long");

  const user = findUser(email);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  // Same message for unknown email and wrong password: don't reveal which accounts exist.
  if (!user || !user.passwordHash || !ok) throw unauthorized("Invalid email or password");

  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, sessionCookieOptions());
  // Token is also returned for API clients (curl, Postman). The browser app ignores it and relies on the cookie.
  res.json({ token, user: publicUser(user) });
});

authRouter.post("/logout", (req, res) => {
  const { maxAge, ...opts } = sessionCookieOptions(); // eslint-disable-line no-unused-vars
  res.clearCookie(COOKIE_NAME, opts);
  res.status(204).end();
});

authRouter.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});