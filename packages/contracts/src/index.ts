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
 * AC3: the profile-completion banner shows until the profile is "complete".
 * Complete = a profile row exists with both required names. Pure so it can be
 * unit-tested and shared by the API and the platform UI.
 */
export function isProfileComplete(profile: ParentProfile | null | undefined): boolean {
  if (!profile) return false;
  return profile.firstName.trim().length > 0 && profile.lastName.trim().length > 0;
}
