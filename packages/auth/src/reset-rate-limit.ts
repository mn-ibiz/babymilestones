/**
 * Per-phone reset-code request limiter (P1-E01-S05 AC4): at most 3 codes per
 * phone per rolling hour. Keyed by phone only (not IP) so the cap can't be
 * bypassed by rotating source addresses. In-memory for now; prod moves the
 * counter to Redis alongside sessions (P1-E01-S04 wiring).
 */
interface Bucket {
  count: number;
  /** Epoch ms when the current window expires. */
  resetAt: number;
}

const MAX_REQUESTS = 3;
const WINDOW_MS = 60 * 60 * 1000;

export interface ResetRateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets — populated only when blocked. */
  retryAfter: number;
}

export class ResetRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxRequests = MAX_REQUESTS,
    private readonly windowMs = WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Atomically check-and-record one request. Returns `allowed: false` once the
   * cap is reached (the 4th request inside the window is blocked).
   */
  consume(phone: string): ResetRateLimitResult {
    const now = this.now();
    const bucket = this.buckets.get(phone);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(phone, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfter: 0 };
    }
    if (bucket.count >= this.maxRequests) {
      return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    bucket.count += 1;
    return { allowed: true, retryAfter: 0 };
  }
}
