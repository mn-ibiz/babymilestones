/**
 * Client-side POS staff login logic (P2-E04-S01 — "log in and start selling").
 *
 * Staff sign in with the same phone + PIN primitives as parents; the API
 * (`POST /auth/staff/login`) is the sole authority on credentials and sets the
 * SSO session cookie scoped to `.babymilestones.co.ke`. This module is pure +
 * unit-tested so the login page stays a thin render, and it deliberately does
 * NOT import `@bm/auth` (that pulls the native argon2 binding, which must never
 * enter the Next client bundle — mirrors `apps/platform/lib/auth-form.ts`). The
 * phone/PIN rules below re-state the API's contract for fast UX + message parity.
 */

// Kenyan mobile: canonical +2547XXXXXXXX or local 07XXXXXXXX (mirrors @bm/auth).
const PHONE_INTL = /^\+2547\d{8}$/u;
const PHONE_LOCAL = /^07\d{8}$/u;
const FOUR_DIGITS = /^\d{4}$/u;

/** Normalise an input phone to +2547XXXXXXXX, or null if it is not a KE mobile. */
export function normalizePhoneInput(input: string): string | null {
  const t = input.trim().replace(/\s+/gu, "");
  if (PHONE_INTL.test(t)) return t;
  if (PHONE_LOCAL.test(t)) return `+254${t.slice(1)}`;
  return null;
}

export interface StaffLoginDraft {
  phone: string;
  pin: string;
}

export const emptyStaffLogin: StaffLoginDraft = { phone: "", pin: "" };

/**
 * Validate the login draft (mirrors the staff-login input gate). Per-field
 * errors; an empty object means valid. The API alone decides credential
 * validity and whether the role may use the POS.
 */
export function validateStaffLogin(
  draft: StaffLoginDraft,
): Partial<Record<keyof StaffLoginDraft, string>> {
  const errors: Partial<Record<keyof StaffLoginDraft, string>> = {};
  if (normalizePhoneInput(draft.phone) === null) {
    errors.phone = "Enter a valid Kenyan phone number";
  }
  if (!FOUR_DIGITS.test(draft.pin)) {
    errors.pin = "PIN must be 4 digits";
  }
  return errors;
}

export interface StaffAuthError {
  message: string;
  /** When set, the message belongs against a specific field. */
  field?: keyof StaffLoginDraft;
}

/**
 * Map an API auth failure to display state. Mirrors the staff-login API: 401 =
 * bad credentials, 403 = the role may not use the POS (a cashier/reception/
 * packer surface), 429 = rate limited. An unexpected status falls back to the
 * server-provided `error` message when present.
 */
export function mapStaffAuthError(status: number, raw: unknown): StaffAuthError {
  switch (status) {
    case 401:
      return { message: "Incorrect phone or PIN." };
    case 403:
      return { message: "This account is not permitted to use the POS." };
    case 429:
      return { message: "Too many attempts. Please wait and try again." };
    default: {
      const serverMessage =
        raw && typeof raw === "object" && typeof (raw as { error?: unknown }).error === "string"
          ? (raw as { error: string }).error
          : null;
      return { message: serverMessage ?? "Something went wrong. Please try again." };
    }
  }
}
