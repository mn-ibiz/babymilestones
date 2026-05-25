/**
 * Settings sub-app view/form logic (P1-E10-S04). Framework-agnostic +
 * dependency-light so it unit-tests without a DOM and never pulls server-only
 * code into the Next bundle. The Settings screens consume this to:
 *  - gate the area to roles holding `manage config` (admin re-checks),
 *  - decide which sections are reachable (the float sub-section needs treasury),
 *  - validate each general section's form client-side before saving (AC1/AC3).
 *
 * The API (`/admin/settings*`) is the source of truth and re-validates + re-runs
 * every permission check; this only shapes input and display.
 */
import {
  SETTING_SCHEMAS,
  type SettingKey,
  type LoyaltySettings,
  type BrandingSettings,
  type ReceiptBrandingSettings,
} from "@bm/contracts";

/** Roles allowed to open the Settings area (mirrors `manage config`). Server re-checks. */
const MANAGE_CONFIG_ROLES = new Set<string>(["admin", "super_admin"]);
/** Roles that additionally satisfy the treasury-gated float sub-section (AC2). */
const MANAGE_FLOAT_ROLES = new Set<string>(["treasury", "super_admin"]);

/** Only admin / super_admin may open Settings (AC2). */
export function canManageSettings(role: string): boolean {
  return MANAGE_CONFIG_ROLES.has(role);
}

/** Whether `role` may reach the float-accounts sub-section from Settings (AC2). */
export function canAccessFloatSection(role: string): boolean {
  return MANAGE_FLOAT_ROLES.has(role);
}

/** A Settings section as rendered on the index. Mirrors the API's section shape. */
export interface SettingsSection {
  key: string;
  label: string;
  href: string;
  kind: "general" | "linked";
  accessible: boolean;
}

/**
 * Validate a general section's form against its contract schema (AC1/AC3).
 * Returns a field→message map (empty when valid). The server re-validates.
 */
export function validateSettingForm(
  key: SettingKey,
  input: unknown,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const parsed = SETTING_SCHEMAS[key].safeParse(input ?? {});
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = (issue.path[0] as string | undefined) ?? "_";
      if (!errors[field]) errors[field] = issue.message;
    }
  }
  return errors;
}

/** Coerce a numeric form field, treating blank/invalid as NaN so validation flags it. */
export function toNumber(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return Number.NaN;
  return Number(trimmed);
}

/** Build a loyalty payload from raw string form fields. */
export function buildLoyaltyPayload(form: {
  earnRatePer100: string;
  redeemValuePerPoint: string;
}): LoyaltySettings {
  return {
    earnRatePer100: toNumber(form.earnRatePer100),
    redeemValuePerPoint: toNumber(form.redeemValuePerPoint),
  };
}

/** Build a branding payload, dropping empty optional fields. */
export function buildBrandingPayload(form: {
  storeName: string;
  logoUrl: string;
  primaryColour: string;
  secondaryColour: string;
}): BrandingSettings {
  const payload: BrandingSettings = {
    storeName: form.storeName.trim(),
    primaryColour: form.primaryColour.trim(),
  };
  if (form.logoUrl.trim()) payload.logoUrl = form.logoUrl.trim();
  if (form.secondaryColour.trim()) payload.secondaryColour = form.secondaryColour.trim();
  return payload;
}

/** Build a receipt-branding payload, dropping empty optional lines. */
export function buildReceiptBrandingPayload(form: {
  headerLine: string;
  footerLine: string;
  showLogo: boolean;
}): ReceiptBrandingSettings {
  const payload: ReceiptBrandingSettings = { showLogo: form.showLogo };
  if (form.headerLine.trim()) payload.headerLine = form.headerLine.trim();
  if (form.footerLine.trim()) payload.footerLine = form.footerLine.trim();
  return payload;
}
