// Role-Based Access Control: roles map to permissions, routes check permissions.
// Routes never check role names directly, so adding a role is a one-line change.

export const PERMISSIONS = {
  REPORTS_READ_ALL: "reports:read:all",   // see every report
  REPORTS_READ_OWN: "reports:read:own",   // see only reports you own (row-level security)
  COSTS_READ: "costs:read",               // see cost fields and cost endpoints (field-level security)
  ORPHANS_READ: "orphans:read",
  QUALITY_READ: "quality:read",
  ALERTS_READ: "alerts:read",
  ALERTS_ACK: "alerts:ack",
};

const P = PERMISSIONS;

export const ROLE_PERMISSIONS = {
  admin: Object.values(P),
  analyst: [P.REPORTS_READ_ALL, P.COSTS_READ, P.ORPHANS_READ, P.QUALITY_READ, P.ALERTS_READ, P.ALERTS_ACK],
  owner: [P.REPORTS_READ_OWN, P.COSTS_READ, P.ALERTS_READ, P.ALERTS_ACK],
  viewer: [P.REPORTS_READ_ALL, P.ALERTS_READ],
};

export const permissionsFor = (role) => ROLE_PERMISSIONS[role] ?? [];
export const can = (user, permission) => Boolean(user?.permissions?.includes(permission));