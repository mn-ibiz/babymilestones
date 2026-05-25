import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPaystackSignature } from "./verify.js";

/**
 * P1-E04-S05 — Paystack webhook signature verification. HMAC-SHA512 over the
 * RAW body with the secret, constant-time compare. Covers AC1 (valid signature
 * verifies) and AC2 (tampered/invalid/missing → rejected).
 */
const SECRET = "sk_test_secret_key";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha512", secret).update(body).digest("hex");
}

describe("verifyPaystackSignature (P1-E04-S05)", () => {
  const body = JSON.stringify({ event: "charge.success", data: { id: 123 } });

  it("AC1: accepts a signature computed over the raw body with the secret", () => {
    expect(verifyPaystackSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("AC1: accepts a Buffer raw body identically to the string form", () => {
    expect(verifyPaystackSignature(Buffer.from(body, "utf8"), sign(body), SECRET)).toBe(true);
  });

  it("AC2: rejects a tampered body (signature no longer matches)", () => {
    const tampered = body.replace("123", "999");
    expect(verifyPaystackSignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it("AC2: rejects a signature made with the wrong secret", () => {
    expect(verifyPaystackSignature(body, sign(body, "wrong"), SECRET)).toBe(false);
  });

  it("AC2: rejects a missing/empty signature header", () => {
    expect(verifyPaystackSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, null, SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, "", SECRET)).toBe(false);
  });

  it("AC2: rejects a garbage/short signature (length mismatch, no throw)", () => {
    expect(verifyPaystackSignature(body, "deadbeef", SECRET)).toBe(false);
  });

  it("rejects when the secret is empty", () => {
    expect(verifyPaystackSignature(body, sign(body), "")).toBe(false);
  });
});
