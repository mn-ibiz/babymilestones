/**
 * Typed WooCommerce client errors (P4-E04-S06 / Story 29.6, AC5).
 *
 * Every non-2xx HTTP response (and every transport-level failure) is mapped to
 * exactly one of these so callers can branch on the failure mode without
 * sniffing status codes. The client does NO retry — deciding what to retry (and
 * how) is the caller's job (S07 / Story 29.7). These errors carry the observed
 * Woo `status` and the first error `message` from the Woo error body so the
 * caller (and the admin test-connection report) can surface a precise reason.
 */

/** Base class for every WooCommerce client error. */
export class WooError extends Error {
  /** Observed HTTP status from Woo, or null for a transport-level failure. */
  readonly status: number | null;
  /** Woo's first error message (`body.message`), when present. */
  readonly wooMessage: string | null;
  /** Woo's machine error code (`body.code`), when present. */
  readonly wooCode: string | null;

  constructor(
    message: string,
    opts: { status?: number | null; wooMessage?: string | null; wooCode?: string | null; cause?: unknown } = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.status = opts.status ?? null;
    this.wooMessage = opts.wooMessage ?? null;
    this.wooCode = opts.wooCode ?? null;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}

/** Misconfiguration (e.g. a non-HTTPS base URL) — thrown at construction. */
export class WooConfigError extends WooError {}

/** 404 — the order/product does not exist. */
export class WooNotFound extends WooError {}

/** 429 — rate limited by WooCommerce / the host. */
export class WooRateLimited extends WooError {}

/** 401 / 403 — bad or unauthorised consumer key/secret. */
export class WooAuthFailed extends WooError {}

/** 5xx OR an unparseable / contract-invalid response body. */
export class WooServerError extends WooError {}

/** Transport-level failure (DNS, TCP, TLS, timeout) — the fetch threw. */
export class WooNetworkError extends WooError {}
