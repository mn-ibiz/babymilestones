/**
 * Ticket door-code generation (Epic 30, stories 30-3/30-4/30-5). A short,
 * human-readable, unambiguous code printed on the e-ticket and typed/scanned at
 * the door. Framework-free so it unit-tests without a DB.
 */
import { randomInt } from "node:crypto";

/**
 * Crockford-ish base32 alphabet with the visually ambiguous characters removed
 * (no I, L, O, U / 0, 1) so a code read aloud or typed at the door is hard to
 * mistranscribe.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 8;

/** Generate one random door code, e.g. `TK-7G3KQP9Z`. */
export function generateTicketCode(): string {
  let body = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `TK-${body}`;
}
