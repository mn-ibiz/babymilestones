import { describe, expect, it } from "vitest";
import { ResetRateLimiter } from "./reset-rate-limit.js";

describe("ResetRateLimiter (P1-E01-S05 AC4)", () => {
  it("allows 3 requests per phone per hour, blocks the 4th", () => {
    const limiter = new ResetRateLimiter();
    expect(limiter.consume("+254712345678").allowed).toBe(true);
    expect(limiter.consume("+254712345678").allowed).toBe(true);
    expect(limiter.consume("+254712345678").allowed).toBe(true);
    const fourth = limiter.consume("+254712345678");
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfter).toBeGreaterThan(0);
  });

  it("counts per phone independently", () => {
    const limiter = new ResetRateLimiter();
    for (let i = 0; i < 3; i++) limiter.consume("+254700000001");
    expect(limiter.consume("+254700000001").allowed).toBe(false);
    expect(limiter.consume("+254700000002").allowed).toBe(true);
  });

  it("resets after the window elapses", () => {
    let t = 0;
    const limiter = new ResetRateLimiter(3, 60 * 60 * 1000, () => t);
    for (let i = 0; i < 3; i++) limiter.consume("p");
    expect(limiter.consume("p").allowed).toBe(false);
    t += 60 * 60 * 1000;
    expect(limiter.consume("p").allowed).toBe(true);
  });
});
