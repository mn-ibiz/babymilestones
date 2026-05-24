/**
 * Staff role taxonomy + role-based landing (P1-E01-S03).
 *
 * Staff authenticate with the SAME phone+PIN primitives as parents
 * (`hashPin`/`verifyPin`, sessions, cookie) — only the `users.role` check and
 * the landing surface differ. The full permission matrix and `actAs`
 * impersonation are owned by the RBAC story (P1-E01-S06); this module is just
 * the role vocabulary and where each role lands after login.
 */
import { hashPin } from "./pin.js";

/** Every role in the system. Order is not significant. */
export const ALL_ROLES = [
  "parent",
  "reception",
  "cashier",
  "packer",
  "accountant",
  "treasury",
  "admin",
  "super_admin",
] as const;

export type Role = (typeof ALL_ROLES)[number];

/** Staff roles = every role that is not a parent. */
export const STAFF_ROLES = ALL_ROLES.filter((r) => r !== "parent") as readonly Exclude<
  Role,
  "parent"
>[];

const STAFF_ROLE_SET = new Set<string>(STAFF_ROLES);

/** True when `role` is a staff role (i.e. may use the staff login flow). */
export function isStaffRole(role: string): boolean {
  return STAFF_ROLE_SET.has(role);
}

/** Roles whose people work inside the admin app rather than a dedicated surface. */
const ADMIN_LANDING_ROLES = new Set<string>(["admin", "super_admin", "treasury", "accountant"]);

/**
 * Resolve the post-login landing path for a role so the client lands in the
 * right app. Admin-family roles share `/admin`; operator roles get their own
 * surface; parents go to the dashboard.
 */
export function landingForRole(role: Role | string): string {
  if (role === "parent") return "/dashboard";
  if (ADMIN_LANDING_ROLES.has(role)) return "/admin";
  // reception, cashier, packer → their own operator surface.
  return `/${role}`;
}

/**
 * A row ready to insert into `users` for a staff member. Keeps PIN hashing in
 * the auth package (where `hashPin` lives) so seeds/tests don't reach for
 * argon2 directly. Insert it with your db handle, e.g.
 *   `await db.insert(users).values(await staffUserSeed("0712000001", "7421", "reception"))`.
 */
export async function staffUserSeed(
  phone: string,
  pin: string,
  role: Exclude<Role, "parent">,
): Promise<{ phone: string; pinHash: string; role: Role }> {
  return { phone, pinHash: await hashPin(pin), role };
}
