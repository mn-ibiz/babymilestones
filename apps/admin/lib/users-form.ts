/**
 * Admin staff login-user view/form logic (P1-E10-S02). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM and never pulls server-only
 * code (the native argon2 binding) into the Next bundle. The staff-login
 * management screen consumes this to:
 *  - gate the management UI to roles holding `manage user` (admin re-checks),
 *  - validate the create form (phone + role + optional PIN) before POSTing,
 *  - render the staff-login list with a human role label + active status.
 *
 * The API (`/admin/users*`) is the source of truth; this only shapes input and
 * display. Server-side re-validates EVERYTHING and is the only PIN authority.
 */
import { SYSTEM_STAFF_ROLES, isSystemStaffRole, type SystemStaffRole } from "@bm/contracts";

/** Roles allowed to manage staff login users (mirrors `manage user`). */
const MANAGE_USERS_ROLES = new Set<string>(["admin", "super_admin"]);

/** Only admin / super_admin may manage staff logins. The server re-checks. */
export function canManageUsers(role: string): boolean {
  return MANAGE_USERS_ROLES.has(role);
}

/** Human label for a system staff role. */
export function systemRoleLabel(role: string): string {
  switch (role) {
    case "reception":
      return "Reception";
    case "cashier":
      return "Cashier";
    case "packer":
      return "Packing";
    case "accountant":
      return "Accountant";
    case "treasury":
      return "Treasury";
    case "admin":
      return "Admin";
    case "super_admin":
      return "Super admin";
    default:
      return role;
  }
}

/** The selectable roles for the create form (AC1). */
export const systemRoleOptions: readonly { value: SystemStaffRole; label: string }[] =
  SYSTEM_STAFF_ROLES.map((r) => ({ value: r, label: systemRoleLabel(r) }));

export interface UserFormErrors {
  phone?: string;
  role?: string;
  pin?: string;
}

// Mirror of @bm/auth.normalizePhone acceptance (KE mobile) WITHOUT importing the
// auth barrel (native binding). The server is the real authority.
const PHONE_INTL = /^\+2547\d{8}$/u;
const PHONE_LOCAL = /^07\d{8}$/u;
const WEAK_PINS = new Set(["0000", "1234", "1111", "2580", "9999"]);

/**
 * Validate the create staff-login form client-side (mirrors the contract +
 * weak-PIN policy). Phone must be a valid KE mobile; role one of the system
 * staff taxonomy; an optional PIN must be 4 digits and not predictable (AC1).
 */
export function validateUserForm(input: {
  phone: string;
  role: string;
  pin: string;
}): UserFormErrors {
  const errors: UserFormErrors = {};
  const phone = input.phone.trim().replace(/\s+/gu, "");
  if (!PHONE_INTL.test(phone) && !PHONE_LOCAL.test(phone)) {
    errors.phone = "Enter a valid Kenyan phone number";
  }
  if (!isSystemStaffRole(input.role)) errors.role = "Choose a role";
  if (input.pin.trim().length > 0) {
    if (!/^\d{4}$/u.test(input.pin)) errors.pin = "PIN must be 4 digits";
    else if (WEAK_PINS.has(input.pin)) errors.pin = "PIN is too predictable";
  }
  return errors;
}

/** Human status label for a staff-login row. */
export function userStatusLabel(active: boolean): string {
  return active ? "Active" : "Deactivated";
}
