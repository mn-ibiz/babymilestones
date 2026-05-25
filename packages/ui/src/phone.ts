/**
 * Kenya phone formatting helpers (X7-S02). The canonical stored form is E.164
 * (`+254XXXXXXXXX`); these helpers format raw digits for display and normalise
 * the common local/intl variants Kenyans type (`07…`, `7…`, `2547…`, `+2547…`).
 */

/** Strip to digits, dropping a single leading `+`. */
function digits(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

/**
 * Normalise a typed Kenyan number to E.164 (`+2547XXXXXXXX` / `+2541XXXXXXXX`).
 * Returns `null` if it can't confidently produce a 12-digit `254` number.
 */
export function normalizeKePhone(input: string): string | null {
  let d = digits(input);
  if (d.startsWith("0")) d = `254${d.slice(1)}`;
  else if (d.startsWith("254")) {
    /* already country-coded */
  } else if (d.length === 9 && (d.startsWith("7") || d.startsWith("1"))) {
    d = `254${d}`;
  }
  if (d.length === 12 && d.startsWith("254")) return `+${d}`;
  return null;
}

/**
 * Format for display as the national grouping `0712 345 678`. Accepts any of
 * the input variants; falls back to lightly grouping the raw digits if the
 * number isn't a recognisable KE number yet (so typing feels live).
 */
export function formatKePhoneDisplay(input: string): string {
  const e164 = normalizeKePhone(input);
  if (e164) {
    const local = `0${e164.slice(4)}`; // drop "+254", restore leading 0
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`.trim();
  }
  const d = digits(input);
  return d;
}
