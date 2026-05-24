import { describe, expect, it } from "vitest";
import { generateOtpCode, hashOtpCode, verifyOtpCode, OTP_TTL_MS } from "./otp.js";

describe("otp helpers (P1-E01-S05)", () => {
  it("generates exactly 6 digits in range, no leading-zero short codes", () => {
    for (let i = 0; i < 2000; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/u);
      const n = Number(code);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });

  it("hash is non-reversible-looking and stable", () => {
    const h = hashOtpCode("123456");
    expect(h).toMatch(/^[0-9a-f]{64}$/u);
    expect(h).not.toContain("123456");
    expect(hashOtpCode("123456")).toBe(h);
  });

  it("verifies a code against its hash (constant-time path)", () => {
    const h = hashOtpCode("654321");
    expect(verifyOtpCode("654321", h)).toBe(true);
    expect(verifyOtpCode("654322", h)).toBe(false);
  });

  it("TTL is 10 minutes", () => {
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000);
  });
});
