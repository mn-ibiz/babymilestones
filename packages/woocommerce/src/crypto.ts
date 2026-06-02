import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Secret-at-rest encryption for WooCommerce credentials (Story 29.6, AC3).
 *
 * The repo had no shared encryption-at-rest helper (SMS/payment secrets live in
 * env vars, only a *reference* is persisted). The WooCommerce panel, by contrast,
 * must store the actual consumer key/secret encrypted at rest, so this introduces
 * an authenticated-encryption helper used by the `wooConfig` persistence layer.
 *
 * Scheme: AES-256-GCM. The 256-bit key is derived per-record from the master key
 * material (`WOO_SECRET_KEY` / passed in) and a random salt via scrypt, so the
 * master key is never used directly and two records never share a derived key.
 * The self-describing envelope is `v1:salt:iv:tag:ciphertext`, each part
 * base64url, so the same master key round-trips it. GCM's auth tag makes any
 * tampering (or a wrong key) fail closed on decrypt.
 */

const VERSION = "v1";
const SALT_BYTES = 16;
const IV_BYTES = 12; // 96-bit nonce — the GCM standard.
const KEY_BYTES = 32; // AES-256.

/** Derive a 256-bit key from the master material + per-record salt. */
function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return scryptSync(masterKey, salt, KEY_BYTES);
}

/**
 * Encrypt `plaintext` with AES-256-GCM under a key derived from `masterKey`.
 * Returns the `v1:salt:iv:tag:ct` envelope (all base64url). A fresh random salt
 * + IV per call means the same input never yields the same ciphertext.
 */
export function encryptSecret(plaintext: string, masterKey: string): string {
  if (!masterKey) throw new Error("encryptSecret: master key is required");
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(masterKey, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    salt.toString("base64url"),
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(":");
}

/**
 * Decrypt a `v1:...` envelope produced by {@link encryptSecret}. Throws if the
 * key is wrong or the ciphertext was tampered with (GCM auth-tag verification).
 */
export function decryptSecret(envelope: string, masterKey: string): string {
  if (!masterKey) throw new Error("decryptSecret: master key is required");
  const parts = envelope.split(":");
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new Error("decryptSecret: unrecognised ciphertext envelope");
  }
  const [, saltB64, ivB64, tagB64, ctB64] = parts;
  const salt = Buffer.from(saltB64!, "base64url");
  const iv = Buffer.from(ivB64!, "base64url");
  const tag = Buffer.from(tagB64!, "base64url");
  const ct = Buffer.from(ctB64!, "base64url");
  const key = deriveKey(masterKey, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** True when `value` looks like a {@link encryptSecret} envelope (cheap shape check). */
export function isEncryptedSecret(value: string): boolean {
  if (!value) return false;
  const parts = value.split(":");
  return parts.length === 5 && parts[0] === VERSION;
}
