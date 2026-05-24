import { z } from "zod";

/** Kenyan phone, normalised to +2547XXXXXXXX. */
export const phoneSchema = z
  .string()
  .regex(/^\+2547\d{8}$/u, "Phone must be normalised to +2547XXXXXXXX");

export type Phone = z.infer<typeof phoneSchema>;

/** Staff login request (P1-E01-S03): phone + 4-digit PIN, same primitives as parents. */
export const staffLoginSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  pin: z.string().regex(/^\d{4}$/u, "PIN must be 4 digits"),
});

export type StaffLogin = z.infer<typeof staffLoginSchema>;

/** Staff login response: the resolved role and the path the client should land on. */
export const staffLoginResponseSchema = z.object({
  role: z.string(),
  redirect: z.string(),
});

export type StaffLoginResponse = z.infer<typeof staffLoginResponseSchema>;

/** PIN reset — request a code by phone (P1-E01-S05 AC1). */
export const resetRequestSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
});
export type ResetRequest = z.infer<typeof resetRequestSchema>;

/** PIN reset — verify the 6-digit code (P1-E01-S05 AC2). */
export const resetVerifySchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  code: z.string().regex(/^\d{6}$/u, "Code must be 6 digits"),
});
export type ResetVerify = z.infer<typeof resetVerifySchema>;

/** PIN reset — complete with token + new PIN (P1-E01-S05 AC3). */
export const resetCompleteSchema = z.object({
  token: z.string().min(1, "Token is required"),
  pin: z.string().regex(/^\d{4}$/u, "PIN must be 4 digits"),
});
export type ResetComplete = z.infer<typeof resetCompleteSchema>;

/**
 * Permissive email (RFC 5322 light) for the parent profile (P1-E02-S01 AC2).
 * Intentionally forgiving: one `@`, a non-empty local part, a dotted domain
 * with a 2+ char TLD, no spaces. We do NOT enforce the full RFC grammar.
 */
export const emailLightRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

/** Trim then treat empty optional text as "absent" (null). */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/**
 * Parent profile create/update (P1-E02-S01 AC1, AC2).
 * Required: first + last name. Optional: email (permissive) + residential area.
 * The same shape backs both create and full update (idempotent upsert).
 */
export const parentProfileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  // Optional: an empty/absent value collapses to null; a present value must
  // pass the permissive (RFC 5322 light) regex.
  email: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v === "" || emailLightRegex.test(v), { message: "Enter a valid email address" })
    .transform((v) => (v === "" ? null : v)),
  residentialArea: optionalText,
});
export type ParentProfileInput = z.infer<typeof parentProfileSchema>;

/** A persisted parent profile as returned by the API (AC4 — read back for edit). */
export interface ParentProfile {
  userId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  residentialArea: string | null;
}

/**
 * Reception walk-in registration (P1-E02-S02).
 *
 * One-screen form (AC1): phone (required), first/last name, optional email +
 * residential area. PIN is intentionally NOT part of this schema (AC3) — a
 * walk-in account is created with no credential and the parent verifies via OTP
 * on first self-login. Phone is raw here; the API normalises it server-side
 * (mirrors signup/login, which never trust a client-normalised phone).
 */
export const receptionWalkInSchema = z.object({
  phone: z.string().trim().min(1, "Phone is required"),
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v === "" || emailLightRegex.test(v), { message: "Enter a valid email address" })
    .transform((v) => (v === "" ? null : v)),
  residentialArea: optionalText,
});
export type ReceptionWalkInInput = z.infer<typeof receptionWalkInSchema>;

/**
 * Phone-collision lookup result (AC2). When a normalised phone already maps to
 * a user, `existing` carries a minimal reference so the Reception form can offer
 * "Open existing" or set a "Merge intent" flag. Never leaks PIN/credential.
 */
export interface PhoneCheckResult {
  available: boolean;
  existing: {
    userId: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Children registry (P1-E02-S03)
// ---------------------------------------------------------------------------

/** Max length of the free-text allergies/notes field (AC1). */
export const CHILD_NOTES_MAX = 500;

/** ISO calendar date YYYY-MM-DD (DOB has no time component). */
export const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/u;

/** Trim then collapse empty optional text to null. */
const optionalChildText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ?? "").trim())
  .transform((v) => (v === "" ? null : v));

/**
 * Add/edit a child (P1-E02-S03 AC1, AC3). Required: first name + a valid
 * calendar DOB. Optional (collapse to null): last name, gender, allergies/notes
 * (≤500 chars). The same shape backs both create and edit so AC fields are
 * always preserved. `parentId` is never accepted from the client — ownership is
 * derived from the session.
 */
export const childSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: optionalChildText,
  dateOfBirth: z
    .string()
    .trim()
    .min(1, "Date of birth is required")
    .regex(isoDateRegex, "Date of birth must be YYYY-MM-DD")
    .refine((v) => {
      const d = new Date(`${v}T00:00:00.000Z`);
      // Reject impossible dates (e.g. 2025-02-30 rolls over) and future DOBs.
      return !Number.isNaN(d.getTime()) && v === d.toISOString().slice(0, 10) && d.getTime() <= Date.now();
    }, "Enter a valid past date of birth"),
  gender: optionalChildText,
  allergiesNotes: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v.length <= CHILD_NOTES_MAX, {
      message: `Notes must be ${CHILD_NOTES_MAX} characters or fewer`,
    })
    .transform((v) => (v === "" ? null : v)),
});
export type ChildInput = z.infer<typeof childSchema>;

/** A persisted child as returned by the API (read back for edit + selectors). */
export interface Child {
  id: string;
  firstName: string;
  lastName: string | null;
  dateOfBirth: string;
  gender: string | null;
  allergiesNotes: string | null;
  archivedAt: string | null;
  /** Derived from DOB (AC2) — surfaced on every booking selector. */
  ageInMonths: number;
}

/**
 * Age in whole months from a DOB (AC2). Shared helper so booking selectors and
 * the registry never duplicate the calculation. Counts completed months: the
 * month boundary advances only once the day-of-month is reached. Clamps to 0
 * for same-day / future dates so callers never see a negative age.
 */
export function ageInMonths(dateOfBirth: string | Date, asOf: Date = new Date()): number {
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime())) return 0;
  let months =
    (asOf.getUTCFullYear() - dob.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - dob.getUTCMonth());
  // Not yet reached the day-of-month → the current month isn't complete.
  if (asOf.getUTCDate() < dob.getUTCDate()) months -= 1;
  return months < 0 ? 0 : months;
}

/**
 * AC3: the profile-completion banner shows until the profile is "complete".
 * Complete = a profile row exists with both required names. Pure so it can be
 * unit-tested and shared by the API and the platform UI.
 */
export function isProfileComplete(profile: ParentProfile | null | undefined): boolean {
  if (!profile) return false;
  return profile.firstName.trim().length > 0 && profile.lastName.trim().length > 0;
}
