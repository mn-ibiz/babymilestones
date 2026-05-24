/**
 * Role + permission model (P1-E01-S06).
 *
 * Single source of truth for the role taxonomy and the `(role, action,
 * resource)` permission matrix. Enforcement is ALWAYS server-side — the client
 * is never trusted. The same matrix encoded here is seeded into the `roles` +
 * `permissions` tables (`packages/db` migration) so the database and the code
 * agree; the snapshot test (`rbac.test.ts`) fails CI if the matrix drifts
 * without an accompanying migration.
 *
 * This module owns three things the rest of the platform consumes:
 *  - `can(role, action, resource)` — the pure authorization decision.
 *  - `requirePermission(action, resource)` — a framework-agnostic guard usable
 *    by API routes / the shared middleware.
 *  - `actAs(...)` — super_admin-only impersonation that records BOTH the real
 *    and impersonated user ids for the audit log and signals a visible banner.
 */
import { ALL_ROLES, type Role } from "./staff.js";

/** Actions a permission can grant. Coarse CRUD verbs plus domain verbs. */
export const ACTIONS = ["create", "read", "update", "delete", "manage"] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Resources the platform guards. Kept deliberately small for P1; new resources
 * are added here AND in the seed migration together (the snapshot gate enforces
 * that the two never drift apart silently).
 */
export const RESOURCES = [
  "wallet",
  "payment",
  "refund",
  "receipt",
  "service",
  "float",
  "reconciliation",
  "user",
  "role",
  "audit",
  "report",
] as const;
export type Resource = (typeof RESOURCES)[number];

/** Wildcard granting every action/resource — only `super_admin` holds it. */
export const ALL = "*" as const;

/** One granted permission: an action on a resource (wildcards allowed). */
export interface Permission {
  action: Action | typeof ALL;
  resource: Resource | typeof ALL;
}

const everything: Permission = { action: ALL, resource: ALL };

/**
 * The authoritative permission matrix: role → the permissions it is granted.
 * Server-side enforcement reads from here (and the seeded mirror in the db).
 * Keep entries sorted/stable so the snapshot is deterministic.
 */
export const PERMISSION_MATRIX: Readonly<Record<Role, readonly Permission[]>> = {
  // Parents manage only their own wallet view + payments they initiate.
  parent: [
    { action: "read", resource: "wallet" },
    { action: "read", resource: "receipt" },
    { action: "create", resource: "payment" },
  ],
  // Front desk: find parents, take top-ups, record visits, register walk-ins.
  reception: [
    { action: "read", resource: "wallet" },
    { action: "create", resource: "payment" },
    { action: "read", resource: "receipt" },
    { action: "read", resource: "service" },
    // P1-E02-S02: register a walk-in parent (staff-initiated account creation).
    { action: "create", resource: "user" },
  ],
  // Cashier: handles money in/out + receipts at the till.
  cashier: [
    { action: "read", resource: "wallet" },
    { action: "create", resource: "payment" },
    { action: "create", resource: "receipt" },
    { action: "read", resource: "receipt" },
  ],
  // Packer: read-only operational view (no money handling).
  packer: [
    { action: "read", resource: "service" },
    { action: "read", resource: "receipt" },
  ],
  // Accountant: read-heavy across financial resources + reports.
  accountant: [
    { action: "read", resource: "wallet" },
    { action: "read", resource: "payment" },
    { action: "read", resource: "refund" },
    { action: "read", resource: "receipt" },
    { action: "read", resource: "reconciliation" },
    { action: "read", resource: "report" },
    { action: "create", resource: "report" },
  ],
  // Treasury: owns float accounts + reconciliation, plus refunds.
  treasury: [
    { action: "manage", resource: "float" },
    { action: "manage", resource: "reconciliation" },
    { action: "create", resource: "refund" },
    { action: "read", resource: "refund" },
    { action: "read", resource: "report" },
  ],
  // Admin: manages people, services, receipts, refunds, reads audit.
  admin: [
    { action: "manage", resource: "user" },
    { action: "manage", resource: "service" },
    { action: "manage", resource: "receipt" },
    { action: "manage", resource: "refund" },
    { action: "read", resource: "wallet" },
    { action: "read", resource: "audit" },
    { action: "read", resource: "report" },
  ],
  // Super admin: everything, including role mutation + impersonation.
  super_admin: [everything],
};

/** Pure authorization decision. Server-side only — never trust the client. */
export function can(role: string, action: Action, resource: Resource): boolean {
  const grants = PERMISSION_MATRIX[role as Role];
  if (!grants) return false;
  return grants.some(
    (p) =>
      (p.action === ALL || p.action === action) &&
      (p.resource === ALL || p.resource === resource),
  );
}

/** Only super_admin may impersonate another user. */
export function canImpersonate(role: string): boolean {
  return role === "super_admin";
}

/**
 * Flatten the matrix into one sorted row list: `(role, action, resource)`.
 * This is exactly what the seed migration inserts and what the snapshot test
 * pins, so any drift between code and db is caught in CI.
 */
export interface PermissionRow {
  role: Role;
  action: Action | typeof ALL;
  resource: Resource | typeof ALL;
}

export function permissionMatrixRows(): PermissionRow[] {
  const rows: PermissionRow[] = [];
  for (const role of ALL_ROLES) {
    for (const p of PERMISSION_MATRIX[role]) {
      rows.push({ role, action: p.action, resource: p.resource });
    }
  }
  return rows.sort(
    (a, b) =>
      a.role.localeCompare(b.role) ||
      a.action.localeCompare(b.action) ||
      a.resource.localeCompare(b.resource),
  );
}

/* ------------------------------------------------------------------ guard */

/** Principal the guard authorizes — the live user resolved from the session. */
export interface PermissionPrincipal {
  id: string;
  role: string;
}

export type PermissionOutcome =
  | { ok: true }
  | { ok: false; status: 403; error: string };

/**
 * Build a guard that enforces `(action, resource)` server-side. Usable by any
 * framework: pass the authenticated principal, get a discriminated outcome the
 * caller maps onto its response. Pairs with `validateSession` (which resolves
 * the live principal) in the shared middleware.
 */
export function requirePermission(action: Action, resource: Resource) {
  return function check(principal: PermissionPrincipal): PermissionOutcome {
    if (can(principal.role, action, resource)) {
      return { ok: true };
    }
    return { ok: false, status: 403, error: "Forbidden: missing permission" };
  };
}

/* ------------------------------------------------------- impersonation */

/** Cookie/header the apps read to render the visible impersonation banner. */
export const IMPERSONATION_BANNER_HEADER = "x-bm-acting-as";

export interface ActAsResult {
  /** The super_admin who initiated the impersonation. */
  realUserId: string;
  /** The user now being acted as. */
  impersonatedUserId: string;
  /** Audit input recording BOTH ids (AC3). Pass to `audit(db, ...)`. */
  audit: {
    actor: string;
    action: "rbac.impersonate";
    target: { table: "users"; id: string };
    payload: { real_user_id: string; impersonated_user_id: string };
  };
  /** Signal the consuming apps surface as a visible banner. */
  banner: { actingAs: string; by: string };
}

export class ImpersonationDeniedError extends Error {
  constructor() {
    super("Only super_admin may impersonate");
    this.name = "ImpersonationDeniedError";
  }
}

/**
 * super_admin-only impersonation (AC3). Returns the audit input recording both
 * the real and impersonated user ids, plus the banner signal the apps render so
 * impersonation is always visible. Throws if the caller is not a super_admin.
 */
export function actAs(
  actor: PermissionPrincipal,
  impersonatedUserId: string,
): ActAsResult {
  if (!canImpersonate(actor.role)) {
    throw new ImpersonationDeniedError();
  }
  return {
    realUserId: actor.id,
    impersonatedUserId,
    audit: {
      actor: actor.id,
      action: "rbac.impersonate",
      target: { table: "users", id: impersonatedUserId },
      payload: { real_user_id: actor.id, impersonated_user_id: impersonatedUserId },
    },
    banner: { actingAs: impersonatedUserId, by: actor.id },
  };
}

/* -------------------------------------------------- role mutation (AC4) */

/** Minimal session-store surface needed to invalidate a user's sessions. */
export interface SessionInvalidator {
  destroyAllForUser(userId: string): Promise<void>;
}

/**
 * Apply a role change and invalidate the user's active sessions (AC4). The
 * actual `users.role` UPDATE is the caller's (it owns the db handle); this
 * helper guarantees the security-critical side effect — every existing session
 * is destroyed so the new role takes effect immediately and a downgraded user
 * cannot keep elevated access.
 */
export async function invalidateSessionsOnRoleChange(
  sessions: SessionInvalidator,
  userId: string,
): Promise<void> {
  await sessions.destroyAllForUser(userId);
}

export type { Role };
