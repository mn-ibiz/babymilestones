import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/** OTP TTL for PIN reset (P1-E01-S05 AC1): 10 minutes. */
export const OTP_TTL_MS = 10 * 60 * 1000;

/**
 * Generate a 6-digit reset code with a CSPRNG (`crypto.randomInt`). The range is
 * inclusive-exclusive, so [100000, 1000000) yields exactly six digits, never a
 * leading-zero short code.
 */
export function generateOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

/** Stable, non-reversible fingerprint of a code; the raw code is never stored. */
export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Constant-time comparison of a submitted code against a stored hash. */
export function verifyOtpCode(code: string, codeHash: string): boolean {
  const a = Buffer.from(hashOtpCode(code));
  const b = Buffer.from(codeHash);
  return a.length === b.length && timingSafeEqual(a, b);
}
