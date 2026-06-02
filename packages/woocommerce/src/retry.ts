/**
 * Failure classification for the writeback retry policy (P4-E04-S07 / Story 29.7,
 * AC3). The Woo client throws typed errors (no retry of its own); the drain
 * worker maps each to a retryable / non-retryable verdict:
 *
 *   - retryable    : network failure, 5xx server error, 429 rate-limit →
 *                    exponential backoff (1m,5m,30m,2h,6h) up to 5 attempts.
 *   - non-retryable: any other 4xx (401/403 auth, 404 not-found, 400 bad request)
 *                    → one retry then dead-letter.
 *
 * An unrecognised thrown value is treated as retryable (transient by default) so
 * a transient bug never permanently drops a mutation without an operator seeing
 * it climb the ladder first.
 */
import {
  WooAuthFailed,
  WooError,
  WooNetworkError,
  WooNotFound,
  WooRateLimited,
  WooServerError,
} from "./errors.js";

/** Is this thrown value a retryable failure (network / 5xx / 429)? (AC3) */
export function isRetryableWooError(err: unknown): boolean {
  if (err instanceof WooNetworkError) return true;
  if (err instanceof WooRateLimited) return true;
  if (err instanceof WooServerError) return true;
  if (err instanceof WooNotFound) return false;
  if (err instanceof WooAuthFailed) return false;
  if (err instanceof WooError) {
    // Any other typed Woo error: 5xx (incl. null status from a 5xx-shaped server
    // error) is retryable; an explicit 4xx is not.
    if (err.status !== null && err.status >= 400 && err.status < 500) return false;
    return true;
  }
  // Unknown error shape — treat as transient.
  return true;
}

/** A classified failure: a flat message + the retryable verdict (AC3). */
export interface ClassifiedWooFailure {
  message: string;
  retryable: boolean;
}

/** Classify a thrown value into a message + retryable verdict for the outbox. */
export function classifyWooError(err: unknown): ClassifiedWooFailure {
  const message = err instanceof Error ? err.message : String(err);
  return { message, retryable: isRetryableWooError(err) };
}
