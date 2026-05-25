/**
 * Admin service-catalogue view/form logic (P1-E07-S01). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM and never pulls server-only
 * code into the Next bundle. The services management screens consume this to:
 *  - gate the management UI to roles holding `manage service` (admin re-checks),
 *  - validate the create/price forms client-side before POSTing,
 *  - render the effective-dated price history (current row highlighted).
 *
 * The API (`/admin/services*`) is the source of truth; this only shapes input
 * and display. Server-side re-validates everything.
 */
import {
  SERVICE_UNITS,
  ATTRIBUTION_ROLES,
  TAX_TREATMENTS,
  SERVICE_PRICE_MIN_CENTS,
  SERVICE_PRICE_MAX_CENTS,
  isAttributionRole,
  isTaxTreatment,
  type ServiceUnit,
  type AttributionRole,
  type TaxTreatment,
} from "@bm/contracts";

/** Roles allowed to manage the service catalogue (mirrors `manage service`). */
const MANAGE_SERVICE_ROLES = new Set<string>(["admin", "super_admin"]);

/** Only admin / super_admin may manage services. The server re-checks (AC). */
export function canManageServices(role: string): boolean {
  return MANAGE_SERVICE_ROLES.has(role);
}

/** Cents → KES decimal string, exact (no float), e.g. 60000 → "600.00". */
export function formatPriceKes(amountCents: number): string {
  const sign = amountCents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(amountCents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Human label for a service unit. */
export function unitLabel(unit: string): string {
  switch (unit) {
    case "play":
      return "Play";
    case "talent":
      return "Talent";
    case "salon":
      return "Salon";
    case "coaching":
      return "Coaching";
    case "event":
      return "Event";
    default:
      return unit;
  }
}

/** The selectable units for the create/edit form. */
export const serviceUnitOptions: readonly { value: ServiceUnit; label: string }[] =
  SERVICE_UNITS.map((u) => ({ value: u, label: unitLabel(u) }));

/** Human label for a staff attribution role (P1-E07-S02). */
export function attributionRoleLabel(role: string): string {
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

/**
 * The selectable attribution roles for the create/edit form (P1-E07-S02 AC1).
 * Mirrors the constrained `ATTRIBUTION_ROLES` enum; the empty option means "none
 * (optional attribution)" (AC3).
 */
export const attributionRoleOptions: readonly { value: AttributionRole; label: string }[] =
  ATTRIBUTION_ROLES.map((r) => ({ value: r, label: attributionRoleLabel(r) }));

/** Re-export the default treatment so the form pre-selects it (P1-E07-S04 AC3). */
export { DEFAULT_TAX_TREATMENT } from "@bm/contracts";

/** Human label for a tax treatment (P1-E07-S04). */
export function taxTreatmentLabel(treatment: string): string {
  switch (treatment) {
    case "vat_inclusive":
      return "VAT inclusive";
    case "vat_exclusive":
      return "VAT exclusive";
    case "vat_exempt":
      return "VAT exempt";
    case "zero_rated":
      return "Zero rated";
    default:
      return treatment;
  }
}

/**
 * The selectable tax treatments for the create/edit form (P1-E07-S04 AC1). The
 * form defaults to {@link DEFAULT_TAX_TREATMENT} (`vat_exempt`, AC3).
 */
export const taxTreatmentOptions: readonly { value: TaxTreatment; label: string }[] =
  TAX_TREATMENTS.map((t) => ({ value: t, label: taxTreatmentLabel(t) }));

export interface ServiceFormErrors {
  name?: string;
  unit?: string;
  attributionRoleRequired?: string;
  taxTreatment?: string;
}

/**
 * Validate the create-service form client-side (mirrors the contract). The
 * attribution role is optional (empty = none, AC3); when present it must be one
 * of the constrained staff-role values (AC1). The server re-validates.
 */
export function validateServiceForm(input: {
  name: string;
  unit: string;
  attributionRoleRequired?: string;
  taxTreatment?: string;
}): ServiceFormErrors {
  const errors: ServiceFormErrors = {};
  if (input.name.trim().length === 0) errors.name = "Name is required";
  if (!(SERVICE_UNITS as readonly string[]).includes(input.unit)) errors.unit = "Choose a unit";
  const role = (input.attributionRoleRequired ?? "").trim();
  if (role !== "" && !isAttributionRole(role)) {
    errors.attributionRoleRequired = "Choose a valid attribution role";
  }
  // Tax treatment is optional in the form (empty = default vat_exempt, AC3); a
  // present value must be one of the constrained treatments (AC1).
  const treatment = (input.taxTreatment ?? "").trim();
  if (treatment !== "" && !isTaxTreatment(treatment)) {
    errors.taxTreatment = "Choose a valid tax treatment";
  }
  return errors;
}

export interface PriceFormErrors {
  amount?: string;
  effectiveFrom?: string;
}

/**
 * Validate the set-price form client-side (mirrors the contract). `amountCents`
 * must be a non-negative integer within bounds; `effectiveFrom` a YYYY-MM-DD date.
 */
export function validatePriceForm(input: {
  amountCents: number;
  effectiveFrom: string;
}): PriceFormErrors {
  const errors: PriceFormErrors = {};
  if (!Number.isInteger(input.amountCents)) {
    errors.amount = "Amount must be a whole number of cents";
  } else if (input.amountCents < SERVICE_PRICE_MIN_CENTS) {
    errors.amount = "Amount cannot be negative";
  } else if (input.amountCents > SERVICE_PRICE_MAX_CENTS) {
    errors.amount = "Amount is too large";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.effectiveFrom) || Number.isNaN(Date.parse(`${input.effectiveFrom}T00:00:00Z`))) {
    errors.effectiveFrom = "Enter a valid date (YYYY-MM-DD)";
  }
  return errors;
}

/** One row in the rendered price-history table. */
export interface PriceHistoryRow {
  amountLabel: string;
  effectiveFrom: string;
  /** "current" when this is the open row, else the YYYY-MM-DD it ended. */
  effectiveTo: string;
  /** True for the single open (effectiveTo === null) row — the current price. */
  isCurrent: boolean;
}

/**
 * Map the API price history onto display rows (AC3/AC4 surfacing). The open row
 * (null effectiveTo) is flagged `isCurrent` and shown as "current".
 */
export function priceHistoryRows(
  prices: readonly { amountCents: number; effectiveFrom: string; effectiveTo: string | null }[],
): PriceHistoryRow[] {
  return prices.map((p) => ({
    amountLabel: formatPriceKes(p.amountCents),
    effectiveFrom: p.effectiveFrom,
    effectiveTo: p.effectiveTo ?? "current",
    isCurrent: p.effectiveTo === null,
  }));
}
