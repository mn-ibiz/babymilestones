import { describe, expect, it } from "vitest";
import {
  WooAuthFailed,
  WooNetworkError,
  WooNotFound,
  WooRateLimited,
  WooServerError,
} from "./errors.js";
import { classifyWooError, isRetryableWooError } from "./retry.js";

/**
 * Story 29.7 (AC3) — failure classification driving the retry policy. Network /
 * 5xx / 429 are retryable (exponential backoff up to 5 attempts); other 4xx
 * (auth, not-found) are non-retryable (one retry then dead-letter).
 */
describe("Woo error classification (Story 29.7, AC3)", () => {
  it("treats network failures as retryable", () => {
    expect(isRetryableWooError(new WooNetworkError("net"))).toBe(true);
  });

  it("treats 5xx server errors as retryable", () => {
    expect(isRetryableWooError(new WooServerError("boom", { status: 503 }))).toBe(true);
  });

  it("treats 429 rate-limit as retryable", () => {
    expect(isRetryableWooError(new WooRateLimited("slow down", { status: 429 }))).toBe(true);
  });

  it("treats 4xx auth failures as non-retryable", () => {
    expect(isRetryableWooError(new WooAuthFailed("nope", { status: 401 }))).toBe(false);
  });

  it("treats 404 not-found as non-retryable", () => {
    expect(isRetryableWooError(new WooNotFound("gone", { status: 404 }))).toBe(false);
  });

  it("classifyWooError extracts a message + retryable flag", () => {
    const c = classifyWooError(new WooServerError("server fell over", { status: 500 }));
    expect(c.retryable).toBe(true);
    expect(c.message).toContain("server fell over");
  });

  it("treats an unknown thrown value as retryable (transient by default)", () => {
    expect(isRetryableWooError(new Error("weird"))).toBe(true);
    const c = classifyWooError("a string error");
    expect(c.retryable).toBe(true);
    expect(c.message).toBe("a string error");
  });
});
