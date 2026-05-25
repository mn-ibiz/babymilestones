/**
 * Paystack webhook signature verification (P1-E04-S05).
 *
 * Paystack signs every webhook with `x-paystack-signature`: the HMAC-SHA512 of
 * the RAW request body, keyed by the integration's SECRET key, hex-encoded. We
 * recompute that HMAC over the exact bytes we received and compare it to the
 * header with a constant-time comparison (`crypto.timingSafeEqual`) so a forged
 * request cannot be confirmed/denied a byte at a time via timing.
 *
 * Pure crypto: no network, no DB. The route layer is responsible for handing us
 * the RAW body (Fastify must preserve it for the webhook path) and the secret
 * key (sourced from env, never the DB or the client).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Paystack `x-paystack-signature` header against the raw request body.
 *
 * @param rawBody   The exact bytes of the request body (string or Buffer).
 * @param signature The `x-paystack-signature` header value (hex HMAC-SHA512).
 * @param secretKey The Paystack SECRET key (env only).
 * @returns `true` only when the recomputed HMAC matches the header in
 *          constant time; `false` for any mismatch, malformed, or missing input.
 */
export function verifyPaystackSignature(
  rawBody: string | Buffer,
  signature: string | undefined | null,
  secretKey: string,
): boolean {
  if (!signature || !secretKey) return false;

  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");

  // Length must match before timingSafeEqual (it throws on length mismatch).
  // Comparing lengths first leaks only the length, not the content.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
