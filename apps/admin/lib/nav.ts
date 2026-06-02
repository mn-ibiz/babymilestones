/**
 * Admin console nav shell + role-gating model (P1-E10-S01).
 *
 * The nav and per-route access decisions derive from the user's permission set.
 * The authoritative RBAC matrix lives in `@bm/auth` (`PERMISSION_MATRIX` / `can`)
 * and is mirrored server-side into the db seed — but the admin Next bundle must
 * NOT import the `@bm/auth` barrel, which pulls the native argon2 binding (see
 * `lib/role-landing.ts` / `lib/impersonation-banner.ts` for the same constraint).
 *
 * So this module re-encodes the *admin-surface slice* of that matrix as a pure,
 * dependency-free decision function. The rbac snapshot test in `@bm/auth` pins
 * the source matrix; if a grant relevant to a nav item changes there, the
 * corresponding test here is the second gate. Enforcement is ALWAYS re-checked
 * server-side by `apps/api` — this gating only decides what to render + which
 * direct-URL hits short-circuit to the 403 view. The client is never trusted.
 */

/* ----------------------------------------- permission slice (mirror of rbac) */

export type NavAction = "create" | "read" | "update" | "delete" | "manage";
export type NavResource =
  | "wallet"
  | "service"
  | "float"
  | "reconciliation"
  | "user"
  | "audit"
  | "report"
  | "config"
  // P6-E05-S05 (Story 35.5): the Expenses module — `manage expense`.
  | "expense";

export interface NavPermission {
  action: NavAction;
  resource: NavResource;
}

const ALL = "*" as const;
type Grant = { action: NavAction | typeof ALL; resource: NavResource | typeof ALL };

/**
 * Admin-surface slice of the `@bm/auth` PERMISSION_MATRIX. Only the roles that
 * land in the admin console (`admin`, `super_admin`, `treasury`, `accountant`)
 * plus the grants relevant to admin nav items are encoded. Roles absent here
 * (parent, reception, cashier, packer) get an empty grant list → no admin nav.
 */
const ADMIN_GRANTS: Readonly<Record<string, readonly Grant[]>> = {
  super_admin: [{ action: ALL, resource: ALL }],
  admin: [
    { action: "manage", resource: "user" },
    { action: "manage", resource: "service" },
    { action: "manage", resource: "wallet" },
    { action: "read", resource: "wallet" },
    { action: "read", resource: "audit" },
    { action: "read", resource: "report" },
    { action: "manage", resource: "config" },
    // P6-E05-S05 (Story 35.5): admin manages expenses + recurring templates.
    { action: "manage", resource: "expense" },
  ],
  treasury: [
    { action: "manage", resource: "float" },
    { action: "manage", resource: "reconciliation" },
    { action: "read", resource: "report" },
  ],
  accountant: [
    { action: "read", resource: "wallet" },
    { action: "read", resource: "reconciliation" },
    { action: "read", resource: "report" },
    // P6-E05-S05 (Story 35.5): owning the books — accountant manages expenses.
    { action: "manage", resource: "expense" },
  ],
};

/**
 * Pure authorization decision for the admin surface. Mirrors `@bm/auth.can` but
 * with one deliberate addition: `manage` is the superset verb, so holding
 * `manage` on a resource implies every CRUD verb on it. This matches the source
 * intent (e.g. `RECONCILIATION_VIEW_ROLES` lets treasury — which holds
 * `manage:reconciliation` — open the read-only reconciliation screen) without
 * having to enumerate each verb a `manage` grant covers.
 */
export function canPerform(role: string, action: NavAction, resource: NavResource): boolean {
  const grants = ADMIN_GRANTS[role];
  if (!grants) return false;
  return grants.some(
    (g) =>
      (g.action === ALL || g.action === action || g.action === "manage") &&
      (g.resource === ALL || g.resource === resource),
  );
}

/* ----------------------------------------------------------- nav catalogue */

export interface NavItem {
  /** Stable route this item links to (also the gating key). */
  href: string;
  /** Human label shown in the side nav. */
  label: string;
  /** Permission a role must hold for this item to be visible/reachable. */
  permission: NavPermission;
  /**
   * Optional explicit role allow-list. When set, visibility/access is decided by
   * membership here INSTEAD of the `(action, resource)` permission — used where a
   * surface is deliberately narrower than any coarse grant (e.g. the operations
   * dashboard is admin/super_admin/treasury only, narrower than `read report`
   * which also grants accountant — P3-E05-S01 AC4). The server re-enforces the
   * same allow-list (`apps/api` operations-dashboard route); the client is never
   * trusted.
   */
  allowRoles?: readonly string[];
}

/**
 * The admin console nav catalogue. Each item names the single permission that
 * gates it; `visibleNavFor` filters this list and `canAccessRoute` reuses the
 * same mapping so the rendered nav and the route guard can never disagree.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  // P3-E05-S01: daily operations dashboard — today across every unit. Gated to
  // admin / super_admin / treasury only (read-only, AC4) — narrower than the
  // `read report` roles, so an explicit allow-list rather than a matrix grant.
  {
    href: "/operations",
    label: "Today at a glance",
    permission: { action: "read", resource: "report" },
    allowRoles: ["admin", "super_admin", "treasury"],
  },
  // P3-E05-S03: top-staff leaderboard — per-staff revenue / services / avg ticket
  // over a period, with a per-staff commission drill-down. Same explicit
  // allow-list as the operations dashboard (admin / super_admin / treasury).
  {
    href: "/operations/leaderboard",
    label: "Top staff leaderboard",
    permission: { action: "read", resource: "report" },
    allowRoles: ["admin", "super_admin", "treasury"],
  },
  // P3-E05-S05: peak-hours heatmap — active sessions by weekday × hour over a
  // period (capped at 12 months), filterable by unit. Same explicit allow-list as
  // the operations dashboard (admin / super_admin / treasury).
  {
    href: "/operations/heatmap",
    label: "Peak hours heatmap",
    permission: { action: "read", resource: "report" },
    allowRoles: ["admin", "super_admin", "treasury"],
  },
  // P6-E06-S03 (Story 35.3): repeat-attendance metrics for events + classes —
  // per-class total attendees, repeat rate, avg classes attended, over a date range.
  // Same explicit allow-list as the rest of the operations surface (admin /
  // super_admin / treasury).
  {
    href: "/operations/repeat-attendance",
    label: "Repeat attendance",
    permission: { action: "read", resource: "report" },
    allowRoles: ["admin", "super_admin", "treasury"],
  },
  { href: "/staff", label: "Staff", permission: { action: "manage", resource: "user" } },
  // P1-E10-S02: staff LOGIN users (phone/role/PIN) — distinct from the `/staff`
  // attribution data records (P1-E07-S03). Both gate on `manage user`.
  { href: "/users", label: "Staff logins", permission: { action: "manage", resource: "user" } },
  { href: "/services", label: "Services", permission: { action: "manage", resource: "service" } },
  // P3-E03-S05: salon-specific reporting tile + per-stylist drill-down. Gates on
  // `read report` — admin / accountant / treasury / super_admin. Forward-compatible
  // with the operational dashboard (Epic 27), which reuses the same data + tile.
  {
    href: "/salon-report",
    label: "Salon report",
    permission: { action: "read", resource: "report" },
  },
  // P6-E04-S02 (Story 34.2): feedback dashboard by unit + by staff. Gates on
  // `read report` — admin / accountant / treasury / super_admin. De-anonymising a
  // response (revealing the parent) is gated to admin/super_admin server-side and
  // audited; the dashboard READ itself is the broader report-reading posture.
  {
    href: "/feedback",
    label: "Feedback",
    permission: { action: "read", resource: "report" },
  },
  // P6-E04-S04 (Story 34.4): curate which 5-star comments to publish as ANONYMISED
  // testimonials on the marketing home page. Curation/publication is a content
  // mutation, so it gates on `manage config` — admin / super_admin only (narrower
  // than the report-reading feedback dashboard). The server re-enforces the same gate.
  {
    href: "/review-snippets",
    label: "Review snippets",
    permission: { action: "manage", resource: "config" },
  },
  // P6-E05-S05 (Story 35.5): Expenses module — the FOUNDATION the consolidated
  // P&L (35.1) consumes. Gated on `manage expense` — admin / accountant /
  // super_admin. The server re-enforces the same gate.
  {
    href: "/expenses",
    label: "Expenses",
    permission: { action: "manage", resource: "expense" },
  },
  // P6-E05-S01 (Story 35.1): consolidated P&L by period — per-unit revenue /
  // direct costs / expenses / net + MoM/YoY comparison. P&L is the sensitive
  // owners'-books view, gated on `read report` — admin / accountant / treasury /
  // super_admin (the same set the server enforces). The server re-enforces it.
  {
    href: "/pnl",
    label: "Consolidated P&L",
    permission: { action: "read", resource: "report" },
  },
  {
    href: "/treasury/float-accounts",
    label: "Float accounts",
    permission: { action: "manage", resource: "float" },
  },
  {
    href: "/treasury/reconciliation",
    label: "Reconciliation",
    permission: { action: "read", resource: "reconciliation" },
  },
  {
    href: "/sms-config",
    label: "SMS provider",
    permission: { action: "manage", resource: "config" },
  },
  {
    href: "/sms-templates",
    label: "SMS templates",
    permission: { action: "manage", resource: "config" },
  },
  // P1-E10-S03: read-only audit log viewer. Gates on `read audit` — admin +
  // super_admin only (treasury/accountant do not hold it).
  { href: "/audit", label: "Audit log", permission: { action: "read", resource: "audit" } },
  // P1-E10-S04: system-wide Settings area. Gates on `manage config` — admin +
  // super_admin. The treasury-gated float sub-section is enforced server-side.
  { href: "/settings", label: "Settings", permission: { action: "manage", resource: "config" } },
];

/**
 * Routes that are always reachable regardless of permission: the console root
 * (a landing/dashboard for any admin-family member) and the 403 page itself
 * (so a forbidden hit never short-circuits to itself — AC2, no redirect loop).
 */
const ALWAYS_ALLOWED = new Set<string>(["/", "/forbidden", "/logout"]);
const ADMIN_FAMILY = new Set<string>(["admin", "super_admin", "treasury", "accountant"]);

/* ------------------------------------------------------------- nav filtering */

/**
 * Whether `role` may see/reach a single nav item. An explicit `allowRoles`
 * list (when present) is authoritative — it overrides the coarse permission so a
 * surface can be deliberately narrower than any matrix grant (P3-E05-S01 AC4).
 */
function canSeeNavItem(role: string, item: NavItem): boolean {
  if (item.allowRoles) return item.allowRoles.includes(role);
  return canPerform(role, item.permission.action, item.permission.resource);
}

/** Side-nav items the role may see, in catalogue order (AC1). Pure + testable. */
export function visibleNavFor(role: string): NavItem[] {
  return NAV_ITEMS.filter((item) => canSeeNavItem(role, item));
}

/** Resolve the deepest nav item whose href prefixes `path` (longest match). */
export function navItemForPath(path: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of NAV_ITEMS) {
    if (path === item.href || path.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best;
}

/**
 * Route-guard predicate (AC2). True when `role` may access `path`. Always-allowed
 * paths (root, /forbidden, /logout) pass for any admin-family member; mapped
 * routes defer to the item's permission; everything else is denied by default.
 */
export function canAccessRoute(role: string, path: string): boolean {
  if (ALWAYS_ALLOWED.has(path)) {
    // /forbidden + /logout must be reachable by anyone who got this far.
    return path === "/" ? ADMIN_FAMILY.has(role) : true;
  }
  const item = navItemForPath(path);
  if (!item) return false;
  return canSeeNavItem(role, item);
}

/* --------------------------------------------------- float status dot (AC3) */

/** Float health as surfaced by the P1-E06 float surface in `apps/api`. */
export type FloatStatus = "ok" | "low" | "unknown";

export interface FloatStatusDot {
  /** Dot colour: green when healthy, red otherwise. */
  color: "green" | "red";
  /** True only when float is confirmed healthy. */
  healthy: boolean;
  /** Accessible label for the dot. */
  label: string;
}

/** Derive the header's green/red float dot from the float status (AC3). */
export function floatStatusDot(status: FloatStatus): FloatStatusDot {
  if (status === "ok") {
    return { color: "green", healthy: true, label: "Float healthy" };
  }
  if (status === "low") {
    return { color: "red", healthy: false, label: "Float low — top up required" };
  }
  return { color: "red", healthy: false, label: "Float status unavailable" };
}

/* ------------------------------------------------------- header view-model */

export interface HeaderUser {
  id: string;
  name: string;
  role: string;
}

export interface HeaderViewModel {
  userName: string;
  /** Human label for the role badge (groups admin-family roles). */
  roleBadge: string;
  floatDot: FloatStatusDot;
  /** Where the logout action posts/navigates. */
  logoutHref: string;
}

/** Human role-badge label. Mirrors `lib/role-landing.surfaceLabel` grouping. */
export function roleBadgeLabel(role: string): string {
  switch (role) {
    case "reception":
      return "Reception";
    case "cashier":
      return "Cashier";
    case "packer":
      return "Packing";
    case "admin":
    case "super_admin":
    case "treasury":
    case "accountant":
      return "Admin Console";
    default:
      return "Unknown";
  }
}

/** Build the header view-model: user, role badge, float dot, logout (AC3). */
export function headerViewModel(user: HeaderUser, float: FloatStatus): HeaderViewModel {
  return {
    userName: user.name.trim() || user.id,
    roleBadge: roleBadgeLabel(user.role),
    floatDot: floatStatusDot(float),
    logoutHref: "/logout",
  };
}
