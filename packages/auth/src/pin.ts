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
