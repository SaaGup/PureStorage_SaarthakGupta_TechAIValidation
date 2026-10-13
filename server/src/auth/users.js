// User directory. Identities and roles come from a JSON file (USERS_FILE);
// the shared demo password comes from DEMO_PASSWORD. In production this module
// would be replaced by the company identity provider (SSO / OIDC); the rest of
// the app only depends on findUser().
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { secrets } from "../config/secrets.js";
import { ROLE_PERMISSIONS } from "./roles.js";

function loadUsers() {
  const list = JSON.parse(fs.readFileSync(env.usersFile, "utf8"));
  for (const u of list) {
    if (!u.email || !ROLE_PERMISSIONS[u.role]) throw new Error(`Invalid user entry in ${env.usersFile}: ${JSON.stringify(u)}`);
  }
  if (!secrets.demoPassword) {
    console.warn("DEMO_PASSWORD is not set: logins are disabled. Copy server/.env.example to server/.env.");
    return list.map((u) => ({ ...u, passwordHash: null }));
  }
  // Passwords are held only as bcrypt hashes in memory, never in plain text.
  const passwordHash = bcrypt.hashSync(secrets.demoPassword, 10);
  return list.map((u) => ({ ...u, passwordHash }));
}

const users = loadUsers();

export const findUser = (email) =>
  users.find((u) => u.email.toLowerCase() === String(email ?? "").trim().toLowerCase());