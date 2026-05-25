/**
 * Treasury float-account CRUD UI logic (P1-E06-S01). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM and never pulls server-only
 * code into the Next bundle. The Treasury page consumes these for the
 * create/edit form (validation, role-gating, kind labels).
 *
 * The server (`/treasury/float-accounts`) is authoritative and re-validates +
 * re-checks the admin/treasury grant; this only drives instant client feedback
 * and the enabled/disabled affordance.
 */

import { FLOAT_ACCOUNT_KINDS, FLOAT_ACCOUNT_NAME_MAX, type FloatAccountKind } from "@bm/contracts";

/** Roles permitted to manage float accounts (mirrors the route guard). */
export const FLOAT_ADMIN_ROLES = ["admin", "super_admin", "treasury"] as const;

/** True when the role may create/edit/delete float accounts (AC2). */
export function canManageFloatAccounts(role: string): boolean {
  return (FLOAT_ADMIN_ROLES as readonly string[]).includes(role);
}

/** Kind picker options in display order, with human labels (AC1). */
export const FLOAT_KIND_OPTIONS: ReadonlyArray<{ value: FloatAccountKind; label: string }> = [
  { value: "mpesa_till", label: "M-Pesa till" },
  { value: "bank", label: "Bank account" },
  { value: "cash_drawer", label: "Cash drawer" },
];

export interface FloatAccountFormValues {
  name: string;
  kind: FloatAccountKind | "";
  /** Whole-KES opening balance as typed in the field. */
  openingBalanceKes: number;
  /** YYYY-MM-DD. */
  openingDate: string;
}

export interface FloatAccountValidation {
  ok: boolean;
  errors: Partial<Record<"name" | "kind" | "openingBalanceKes" | "openingDate", string>>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** Instant client-side validation (server re-validates authoritatively). */
export function validateFloatAccount(v: FloatAccountFormValues): FloatAccountValidation {
  const errors: FloatAccountValidation["errors"] = {};
  if (v.name.trim() === "") errors.name = "Name is required";
  else if (v.name.trim().length > FLOAT_ACCOUNT_NAME_MAX) errors.name = "Name is too long";

  if (v.kind === "" || !(FLOAT_ACCOUNT_KINDS as readonly string[]).includes(v.kind)) {
    errors.kind = "Choose a float account kind";
  }

  if (!Number.isFinite(v.openingBalanceKes) || v.openingBalanceKes < 0) {
    errors.openingBalanceKes = "Opening balance cannot be negative";
  }

  if (!ISO_DATE.test(v.openingDate) || Number.isNaN(Date.parse(`${v.openingDate}T00:00:00Z`))) {
    errors.openingDate = "Enter a valid date";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/** True when the create/edit form can be submitted. */
export function canSubmitFloatAccount(validation: FloatAccountValidation): boolean {
  return validation.ok;
}

/** Whole-KES (field) → integer cents (contract). */
export function kesToCents(amountKes: number): number {
  return Math.round(amountKes * 100);
}

/** Human label for a stored kind value. */
export function floatKindLabel(kind: string): string {
  return FLOAT_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}
