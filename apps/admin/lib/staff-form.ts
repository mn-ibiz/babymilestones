/**
 * Admin staff data-record view/form logic (P1-E07-S03). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM and never pulls server-only
 * code into the Next bundle. The staff management screen consumes this to:
 *  - gate the management UI to roles holding `manage service` (admin re-checks),
 *  - validate the create/edit form client-side before POSTing,
 *  - render the staff list with a human role label + active status.
 *
 * The API (`/admin/staff*`) is the source of truth; this only shapes input and
 * display. Server-side re-validates everything. Staff are pure data records —
 * no auth association, no logins.
 */
import { STAFF_ROLES, type StaffRole } from "@bm/contracts";

/** Roles allowed to manage staff records (mirrors `manage service`). */
const MANAGE_STAFF_ROLES = new Set<string>(["admin", "super_admin"]);

/** Only admin / super_admin may manage staff. The server re-checks (AC2). */
export function canManageStaff(role: string): boolean {
  return MANAGE_STAFF_ROLES.has(role);
}

/** Human label for a staff role. Mirrors the attribution-role labels (7-2). */
export function staffRoleLabel(role: string): string {
  switch (role) {
    case "stylist":
      return "Stylist";
    case "instructor":
      return "Instructor";
    case "attendant":
      return "Attendant";
    case "coach":
      return "Coach";
    case "event_staff":
      return "Event staff";
    default:
      return role;
  }
}

/** The selectable roles for the create/edit form (AC1). */
export const staffRoleOptions: readonly { value: StaffRole; label: string }[] = STAFF_ROLES.map(
  (r) => ({ value: r, label: staffRoleLabel(r) }),
);

export interface StaffFormErrors {
  displayName?: string;
  role?: string;
}

/**
 * Validate the create/edit staff form client-side (mirrors the contract). Name
 * is required; role must be one of the constrained taxonomy values (AC1). The
 * server re-validates.
 */
export function validateStaffForm(input: { displayName: string; role: string }): StaffFormErrors {
  const errors: StaffFormErrors = {};
  if (input.displayName.trim().length === 0) errors.displayName = "Name is required";
  if (!(STAFF_ROLES as readonly string[]).includes(input.role)) errors.role = "Choose a role";
  return errors;
}

/** Human status label for a staff row. */
export function staffStatusLabel(active: boolean): string {
  return active ? "Active" : "Inactive";
}
