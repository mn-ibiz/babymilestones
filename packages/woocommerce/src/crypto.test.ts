import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret, isEncryptedSecret } from "./crypto.js";

/**
 * AES-256-GCM secret-at-rest helper (Story 29.6, AC3). The WooCommerce consumer
 * key/secret are encrypted before they land in the DB and decrypted only when a
 * client is constructed server-side. The ciphertext is self-describing
 * (v1:salt:iv:tag:ct, base64url) so the same key material round-trips it.
 */
const KEY = "test-encryption-key-material-please-rotate";

describe("woocommerce secret-at-rest crypto (Story 29.6 AC3)", () => {
  it("round-trips a secret", () => {
    const enc = encryptSecret("cs_super_secret_value", KEY);
    expect(decryptSecret(enc, KEY)).toBe("cs_super_secret_value");
  });

  it("ciphertext does not contain the plaintext", () => {
    const enc = encryptSecret("cs_super_secret_value", KEY);
    expect(enc).not.toContain("cs_super_secret_value");
    expect(isEncryptedSecret(enc)).toBe(true);
  });

  it("produces a different ciphertext each time (random IV/salt)", () => {
    const a = encryptSecret("same-input", KEY);
    const b = encryptSecret("same-input", KEY);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe("same-input");
    expect(decryptSecret(b, KEY)).toBe("same-input");
  });

  it("fails to decrypt with the wrong key (auth tag mismatch)", () => {
    const enc = encryptSecret("secret", KEY);
    expect(() => decryptSecret(enc, "a-different-key-entirely")).toThrow();
  });

  it("rejects a tampered ciphertext", () => {
    const enc = encryptSecret("secret", KEY);
    const tampered = enc.slice(0, -2) + (enc.endsWith("A") ? "B" : "A");
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  it("isEncryptedSecret recognises only the versioned envelope", () => {
    expect(isEncryptedSecret("plain text")).toBe(false);
    expect(isEncryptedSecret("")).toBe(false);
    expect(isEncryptedSecret(encryptSecret("x", KEY))).toBe(true);
  });
});
