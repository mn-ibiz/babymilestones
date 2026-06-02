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
  "product",
  "float",
  "reconciliation",
  "user",
  "role",
  "audit",
  "report",
  "config",
  // P3-E04 (Epic 26): the loyalty-points engine. `manage loyalty` gates the
  // admin manual adjustment surface (S03); read access is implicit for the
  // parent's own balance view (handled at the route, not the matrix).
  "loyalty",
  // P6-E05 (Epic 35 / Story 35.5): the Expenses module. `manage expense` gates
  // the admin/accountant expense + recurring-template CRUD surface — the FOUNDATION
  // the consolidated P&L (35.1) consumes. The accountant (otherwise read-heavy)
  // is granted this management verb because owning the books is their function.
  "expense",
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
    // P2-E04-S02: read the product catalogue at the POS (scan/search, price+stock).
    { action: "read", resource: "product" },
    // P1-E02-S02: register a walk-in parent (staff-initiated account creation).
    { action: "create", resource: "user" },
  ],
  // Cashier: handles money in/out + receipts at the till.
  cashier: [
    { action: "read", resource: "wallet" },
    { action: "create", resource: "payment" },
    { action: "create", resource: "receipt" },
    { action: "read", resource: "receipt" },
    // P2-E04-S02: read the product catalogue at the POS (scan/search, price+stock).
    { action: "read", resource: "product" },
  ],
  // Packer: read-only operational view (no money handling).
  packer: [
    { action: "read", resource: "service" },
    { action: "read", resource: "receipt" },
    // P2-E04-S02: read the product catalogue at the POS.
    { action: "read", resource: "product" },
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
    // P6-E05-S05 (Story 35.5): owning the books — the accountant manages expenses
    // + recurring expense templates (the FOUNDATION the P&L consumes).
    { action: "manage", resource: "expense" },
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
    // P1-E03-S07: managing the wallet covers the per-parent auto-credit toggle.
    // Reception/cashier hold only `read wallet`, so they cannot flip it.
    { action: "manage", resource: "wallet" },
    { action: "read", resource: "wallet" },
    { action: "read", resource: "audit" },
    { action: "read", resource: "report" },
    // P1-E09-S02: managing `config` gates the SMS provider config CRUD surface.
    { action: "manage", resource: "config" },
    // P3-E04-S03: managing `loyalty` gates the admin manual points-adjustment.
    { action: "manage", resource: "loyalty" },
    // P6-E05-S05 (Story 35.5): the admin also manages expenses + recurring templates.
    { action: "manage", resource: "expense" },
  ],
  // Super admin: everything, including role mutation + impersonation.
  super_admin: [everything],
};

/* ----------------------------------------------- named capabilities (S03) */

/**
 * Named capabilities (P1-E06-S03). Where the `(action, resource)` matrix covers
 * coarse CRUD, a *capability* names one specific, high-trust action that must be
 * granted to an explicit allow-list of roles — independent of the resource it
 * touches. `treasury.approve_adjustment` is the first: approving a reconciliation
 * adjusting entry is reserved to `treasury` (and `super_admin`), even though
 * `admin` may post the entry and view the reconciliation screen (dual-approval).
 *
 * Capabilities are mirrored into the `role_capabilities` seed table and pinned by
 * the snapshot test, exactly like the permission matrix — code and db cannot
 * drift apart silently.
 */
export const CAPABILITIES = ["treasury.approve_adjustment"] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * Capability allow-lists. Keep entries stable/sorted so the snapshot is
 * deterministic. Roles absent from a capability's list simply do not hold it.
 * `super_admin` holds every capability via its wildcard (see `hasCapability`).
 */
export const CAPABILITY_MATRIX: Readonly<Partial<Record<Role, readonly Capability[]>>> = {
  treasury: ["treasury.approve_adjustment"],
  super_admin: ["treasury.approve_adjustment"],
};

/**
 * Does `role` hold the named capability? `super_admin` holds all of them (it owns
 * the `*`/`*` wildcard in the permission matrix). Server-side only.
 */
export function hasCapability(role: string, capability: Capability): boolean {
  if (role === "super_admin") return true;
  const caps = CAPABILITY_MATRIX[role as Role];
  return caps?.includes(capability) ?? false;
}

/** Approving a reconciliation adjusting entry — AC2/AC3 (treasury + super_admin). */
export function canApproveAdjustment(role: string): boolean {
  return hasCapability(role, "treasury.approve_adjustment");
}

/**
 * Roles that may open the reconciliation screen (AC3). Deliberately broader than
 * the approval capability: `admin` can view + post adjustments but cannot approve.
 */
export const RECONCILIATION_VIEW_ROLES = ["admin", "treasury", "super_admin"] as const;
const RECONCILIATION_VIEW_SET = new Set<string>(RECONCILIATION_VIEW_ROLES);

/** True when `role` may open the reconciliation screen (AC3). */
export function canViewReconciliation(role: string): boolean {
  return RECONCILIATION_VIEW_SET.has(role);
}

/** Flattened capability grants for the seed mirror + snapshot drift gate. */
export interface CapabilityRow {
  role: Role;
  capability: Capability;
}

export function capabilityMatrixRows(): CapabilityRow[] {
  const rows: CapabilityRow[] = [];
  for (const role of ALL_ROLES) {
    for (const cap of CAPABILITY_MATRIX[role] ?? []) {
      rows.push({ role, capability: cap });
    }
  }
  return rows.sort(
    (a, b) => a.role.localeCompare(b.role) || a.capability.localeCompare(b.capability),
  );
}

/** Build a guard enforcing a named capability server-side (mirrors requirePermission). */
export function requireCapability(capability: Capability) {
  return function check(principal: PermissionPrincipal): PermissionOutcome {
    if (hasCapability(principal.role, capability)) {
      return { ok: true };
    }
    return { ok: false, status: 403, error: "Forbidden: missing permission" };
  };
}

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
