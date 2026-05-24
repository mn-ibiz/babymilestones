import { describe, expect, it } from "vitest";
import { LoginRateLimiter } from "./rate-limit.js";

describe("LoginRateLimiter (P1-E01-S02 AC3)", () => {
  it("allows up to 5 failures, blocks the 6th attempt", () => {
    const rl = new LoginRateLimiter();
    for (let i = 0; i < 5; i += 1) {
      expect(rl.check("+254712345678", "1.2.3.4").allowed).toBe(true);
      rl.recordFailure("+254712345678", "1.2.3.4");
    }
    const sixth = rl.check("+254712345678", "1.2.3.4");
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfter).toBeGreaterThan(0);
  });

  it("keys independently by (phone, ip)", () => {
    const rl = new LoginRateLimiter();
    for (let i = 0; i < 5; i += 1) rl.recordFailure("+254712345678", "1.1.1.1");
    expect(rl.check("+254712345678", "1.1.1.1").allowed).toBe(false);
    // Same phone, different IP is a separate bucket.
    expect(rl.check("+254712345678", "2.2.2.2").allowed).toBe(true);
    // Same IP, different phone is a separate bucket.
    expect(rl.check("+254700000000", "1.1.1.1").allowed).toBe(true);
  });

  it("reset() clears the counter (used after success)", () => {
    const rl = new LoginRateLimiter();
    for (let i = 0; i < 5; i += 1) rl.recordFailure("+254712345678", "1.1.1.1");
    rl.reset("+254712345678", "1.1.1.1");
    expect(rl.check("+254712345678", "1.1.1.1").allowed).toBe(true);
  });

  it("window expiry reopens attempts and Retry-After counts down", () => {
    let clock = 1_000_000;
    const rl = new LoginRateLimiter(5, 5 * 60 * 1000, () => clock);
    for (let i = 0; i < 5; i += 1) rl.recordFailure("+254712345678", "1.1.1.1");
    expect(rl.check("+254712345678", "1.1.1.1")).toEqual({ allowed: false, retryAfter: 300 });
    clock += 4 * 60 * 1000; // 1 min left
    expect(rl.check("+254712345678", "1.1.1.1").retryAfter).toBe(60);
    clock += 60 * 1000 + 1; // window elapsed
    expect(rl.check("+254712345678", "1.1.1.1").allowed).toBe(true);
  });
});
