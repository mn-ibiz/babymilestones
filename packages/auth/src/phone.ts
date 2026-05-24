// Kenyan phone normalisation → canonical +2547XXXXXXXX (spec / P1-E01-S01).
const INTL = /^\+2547\d{8}$/u;
const LOCAL = /^07\d{8}$/u;

/** Normalise an input phone to +2547XXXXXXXX, or null if it isn't a valid KE mobile. */
export function normalizePhone(input: string): string | null {
  const t = input.trim().replace(/\s+/gu, "");
  if (INTL.test(t)) return t;
  if (LOCAL.test(t)) return `+254${t.slice(1)}`;
  return null;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}
