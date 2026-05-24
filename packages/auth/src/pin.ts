import { hash, verify } from "@node-rs/argon2";

// Predictable PINs rejected at signup (P1-E01-S01 AC4).
const WEAK_PINS = new Set(["0000", "1234", "1111", "2580", "9999"]);

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/u.test(pin);
}

export function isWeakPin(pin: string): boolean {
  return WEAK_PINS.has(pin);
}

/** argon2id hash. The raw PIN is never logged or echoed (AC5). */
export function hashPin(pin: string): Promise<string> {
  return hash(pin); // @node-rs/argon2 defaults to argon2id
}

export function verifyPin(pinHash: string, pin: string): Promise<boolean> {
  return verify(pinHash, pin);
}

/**
 * A fixed argon2id hash of a value no real PIN can equal. On an unknown phone,
 * verify the submitted PIN against this so the failure path runs the same
 * (expensive) argon2 verify — matching timing and response of a wrong PIN and
 * defeating user enumeration (P1-E01-S02 AC4). Pre-computed so logins never pay
 * to hash a throwaway value.
 */
export const DUMMY_PIN_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$uTlEo77WCDzLJkD2RSda5g$dNeGmodVQjot5TsQIUfCV8j/iJMnBLJxu66AMX4+4Zw";
