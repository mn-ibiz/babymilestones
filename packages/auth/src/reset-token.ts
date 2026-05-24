import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Audience-bound, time-limited reset token (P1-E01-S05 AC2). A compact,
 * self-contained JWS-style token: `base64url(payload).base64url(HMAC-SHA256)`.
 * We avoid a third-party JWT dependency — the payload is small and fully under
 * our control, and HMAC-SHA256 over the encoded payload gives the same
 * tamper-evidence guarantee a signed JWT would.
 *
 * Single-use is layered on top by the caller: each token carries a unique `jti`,
 * and the reset step records consumed jtis in {@link ConsumedTokenStore} so a
 * token cannot be replayed even before it expires.
 */
export const RESET_TOKEN_AUDIENCE = "pin-reset" as const;

export interface ResetTokenPayload {
  /** Subject — the user id the reset is for. */
  sub: string;
  /** Audience binding; must equal {@link RESET_TOKEN_AUDIENCE}. */
  aud: string;
  /** Unique token id, for single-use tracking. */
  jti: string;
  /** Issued-at (epoch ms). */
  iat: number;
  /** Expiry (epoch ms). */
  exp: number;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export interface IssueResetTokenOpts {
  userId: string;
  secret: string;
  /** Time-to-live in ms (default 15 min — AC2). */
  ttlMs?: number;
  now?: () => number;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000;

/** Mint a fresh audience-bound reset token (15-min default TTL). */
export function issueResetToken(opts: IssueResetTokenOpts): string {
  const now = (opts.now ?? Date.now)();
  const payload: ResetTokenPayload = {
    sub: opts.userId,
    aud: RESET_TOKEN_AUDIENCE,
    jti: randomUUID(),
    iat: now,
    exp: now + (opts.ttlMs ?? DEFAULT_TTL_MS),
  };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, opts.secret)}`;
}

export type VerifyResetTokenResult =
  | { ok: true; payload: ResetTokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "bad_audience" | "expired" };

export interface VerifyResetTokenOpts {
  token: string;
  secret: string;
  now?: () => number;
}

/** Verify signature, audience and expiry. Does NOT enforce single-use. */
export function verifyResetToken(opts: VerifyResetTokenOpts): VerifyResetTokenResult {
  const parts = opts.token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [encoded, providedSig] = parts as [string, string];

  const expectedSig = sign(encoded, opts.secret);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: ResetTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ResetTokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload.sub !== "string" ||
    typeof payload.jti !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.aud !== RESET_TOKEN_AUDIENCE) return { ok: false, reason: "bad_audience" };
  const now = (opts.now ?? Date.now)();
  if (now >= payload.exp) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

/**
 * Tracks reset-token jtis that have already been redeemed, so a valid token
 * cannot be replayed (AC2: 1-time). In-memory for now; prod moves this to the
 * same Redis as sessions (P1-E01-S04 wiring).
 */
export interface ConsumedTokenStore {
  /** Returns true if newly consumed, false if it was already consumed. */
  consume(jti: string): Promise<boolean>;
}

export class InMemoryConsumedTokenStore implements ConsumedTokenStore {
  private readonly seen = new Set<string>();

  async consume(jti: string): Promise<boolean> {
    if (this.seen.has(jti)) return false;
    this.seen.add(jti);
    return true;
  }
}
