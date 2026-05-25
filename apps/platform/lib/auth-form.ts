/**
 * Client-side sign-in / sign-up form logic for the public marketing surface
 * (P1-E12-S04). Pure + unit-tested so the `(public)/(auth)/` pages stay thin
 * renders and all validation/derivation runs without a DOM or a request object.
 *
 * Validation mirrors the parent auth API (`apps/api` signup 1-1 / login 1-2 /
 * reset 1-5) for fast UX and message parity — the API is the sole authority
 * (it owns phone normalisation, argon2, weak-PIN + duplicate detection). This
 * module deliberately does NOT import `@bm/auth`: that package pulls the native
 * argon2 binding, which must never enter the Next client bundle (mirrors
 * `middleware.ts`). The phone/PIN rules below re-state the API's contract.
 */

// Kenyan phone: canonical +2547XXXXXXXX or local 07XXXXXXXX (mirrors @bm/auth).
const PHONE_INTL = /^\+2547\d{8}$/u;
const PHONE_LOCAL = /^07\d{8}$/u;
const FOUR_DIGITS = /^\d{4}$/u;

/** Predictable PINs the API rejects at signup/reset (mirrors @bm/auth WEAK_PINS). */
const WEAK_PINS = new Set(["0000", "1234", "1111", "2580", "9999"]);

/** Normalise an input phone to +2547XXXXXXXX, or null if it isn't a valid KE mobile. */
export function normalizePhoneInput(input: string): string | null {
  const t = input.trim().replace(/\s+/gu, "");
  if (PHONE_INTL.test(t)) return t;
  if (PHONE_LOCAL.test(t)) return `+254${t.slice(1)}`;
  return null;
}

export interface SignInDraft {
  phone: string;
  pin: string;
}

export interface SignUpDraft {
  phone: string;
  pin: string;
  pinConfirm: string;
}

export const emptySignIn: SignInDraft = { phone: "", pin: "" };
export const emptySignUp: SignUpDraft = { phone: "", pin: "", pinConfirm: "" };

/**
 * Validate the sign-in draft (mirrors login 1-2's input gate). Per-field errors;
 * an empty object means valid. The API alone decides credential validity.
 */
export function validateSignIn(draft: SignInDraft): Partial<Record<keyof SignInDraft, string>> {
  const errors: Partial<Record<keyof SignInDraft, string>> = {};
  if (normalizePhoneInput(draft.phone) === null) {
    errors.phone = "Enter a valid Kenyan phone number";
  }
  if (!FOUR_DIGITS.test(draft.pin)) {
    errors.pin = "PIN must be 4 digits";
  }
  return errors;
}

/**
 * Validate the sign-up draft (mirrors signup 1-1's input gate, in order:
 * phone → PIN format → confirm match → weak PIN). The API re-validates and
 * owns duplicate-phone detection.
 */
export function validateSignUp(draft: SignUpDraft): Partial<Record<keyof SignUpDraft, string>> {
  const errors: Partial<Record<keyof SignUpDraft, string>> = {};
  if (normalizePhoneInput(draft.phone) === null) {
    errors.phone = "Enter a valid Kenyan phone number";
  }
  if (!FOUR_DIGITS.test(draft.pin)) {
    errors.pin = "PIN must be 4 digits";
  } else if (WEAK_PINS.has(draft.pin)) {
    errors.pin = "Choose a less predictable PIN";
  }
  if (draft.pinConfirm !== draft.pin) {
    errors.pinConfirm = "PINs do not match";
  }
  return errors;
}

/** Default post-auth destination when no intended destination was captured. */
export const DEFAULT_POST_AUTH_DEST = "/home";

/**
 * AC2: resolve the post-auth redirect, honouring the captured intended
 * destination (`?next=`). Only same-origin absolute paths are allowed — an
 * external or protocol-relative `next` is dropped (open-redirect guard) and we
 * fall back to the dashboard.
 */
export function resolvePostAuthDest(next: string | null | undefined): string {
  if (!next) return DEFAULT_POST_AUTH_DEST;
  // Must be a root-relative path, not protocol-relative (`//evil`) or absolute URL.
  if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT_POST_AUTH_DEST;
  return next;
}

/** Build the sign-up href, carrying the intended destination through (AC2). */
export function signUpHref(next?: string | null): string {
  return next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";
}

/** Build the sign-in href, carrying the intended destination through (AC2). */
export function signInHref(next?: string | null): string {
  return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
}

export interface AuthApiError {
  /** Message to surface to the parent (already parent-safe from the API). */
  message: string;
  /** Field to attach the error to, when the API named one. */
  field?: string;
  /** When the API says the phone already has an account → steer to sign-in (AC). */
  redirectToSignIn?: boolean;
}

interface RawApiError {
  error?: string;
  field?: string;
  action?: string;
}

/**
 * Map a non-OK auth API response body to display state. The signup duplicate
 * path returns `{ action: "login" }` — surface it as a steer-to-sign-in cue so
 * the form can link the parent to login instead of dead-ending (1-1 AC2).
 */
export function mapAuthError(status: number, body: RawApiError | null): AuthApiError {
  const message = body?.error ?? `Something went wrong (${status})`;
  const result: AuthApiError = { message };
  if (body?.field) result.field = body.field;
  if (body?.action === "login") result.redirectToSignIn = true;
  return result;
}
