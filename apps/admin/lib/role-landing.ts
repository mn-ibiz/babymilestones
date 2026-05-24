/**
 * Client-side mirror of the API's role→landing resolution (P1-E01-S03).
 *
 * The API (`@bm/auth.landingForRole`) is the source of truth and returns
 * `{ role, redirect }` on staff login; the admin shell uses this to label the
 * signed-in surface without re-deriving auth logic. Kept dependency-free so the
 * Next bundle never pulls the native argon2 binding from `@bm/auth`.
 */
export type StaffSurface = "reception" | "cashier" | "packer" | "admin";

/** Human label for the surface a staff role lands on. */
export function surfaceLabel(role: string): string {
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
