/**
 * KES money helpers (X7-S02). Money is stored as **integer cents** everywhere
 * in Baby Milestones — never a float — so these helpers convert between the
 * internal cents value and the human-facing decimal string without ever doing
 * float arithmetic on the canonical value.
 */

/** Format integer cents to a plain decimal string, e.g. `50000` → `"500.00"`. */
export function centsToDisplay(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  const body = `${whole}.${String(frac).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/**
 * Parse a user-typed money string to integer cents. Strips everything except
 * digits, an optional leading `-`, and a single decimal point; the fractional
 * part is truncated/padded to exactly two digits. Returns `null` for input
 * with no digits at all (so callers can treat empty/garbage as "unset").
 */
export function displayToCents(input: string): number | null {
  const trimmed = input.trim();
  const negative = trimmed.startsWith("-");
  const cleaned = trimmed.replace(/[^0-9.]/g, "");
  if (!/[0-9]/.test(cleaned)) return null;
  const [wholePart = "0", fracPartRaw = ""] = cleaned.split(".");
  const frac = (fracPartRaw + "00").slice(0, 2);
  const whole = wholePart === "" ? 0 : Number.parseInt(wholePart, 10);
  const cents = whole * 100 + Number.parseInt(frac || "0", 10);
  return negative ? -cents : cents;
}

/** Full KES label for display, e.g. `50000` → `"KES 500.00"`. */
export function formatKes(cents: number): string {
  return `KES ${centsToDisplay(cents)}`;
}
