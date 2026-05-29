/**
 * Commission-rate set/correct form validation (P3-E01-S01). Pure + framework-free
 * so it unit-tests without React. Mirrors the server's checks: a decimal rate in
 * [0, 100] and a valid effective-from instant. Auto-closing the previous open
 * rate is the server's job — the form only collects the new rate.
 */

export interface CommissionRateFormValues {
  /** Decimal percentage as typed, e.g. "12.5". */
  ratePercent: string;
  /** ISO timestamp (or a datetime-local value the client converts). */
  effectiveFrom: string;
  reason?: string;
}

export interface CommissionRateFormErrors {
  ratePercent?: string;
  effectiveFrom?: string;
}

/** Validate the form; returns a field→message map (empty when valid). */
export function validateCommissionRateForm(
  values: CommissionRateFormValues,
): CommissionRateFormErrors {
  const errors: CommissionRateFormErrors = {};
  const raw = values.ratePercent.trim();
  if (!raw) {
    errors.ratePercent = "Rate is required";
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n)) errors.ratePercent = "Rate must be a number";
    else if (n < 0 || n > 100) errors.ratePercent = "Rate must be between 0 and 100";
  }
  const from = values.effectiveFrom.trim();
  if (!from) errors.effectiveFrom = "Effective-from is required";
  else if (Number.isNaN(new Date(from).getTime())) errors.effectiveFrom = "Effective-from must be a valid date/time";
  return errors;
}

/** A commission-rate row as returned by the admin API. */
export interface CommissionRate {
  id: string;
  staffId: string;
  ratePercent: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
}

/** Human label for a rate row in the history list ("12.50% from … to open"). */
export function ratePeriodLabel(rate: CommissionRate): string {
  const to = rate.effectiveTo ? rate.effectiveTo.slice(0, 10) : "open";
  return `${rate.ratePercent}% · ${rate.effectiveFrom.slice(0, 10)} → ${to}`;
}

/** True when this rate row is the currently-open one (no successor yet). */
export function isOpenRate(rate: CommissionRate): boolean {
  return rate.effectiveTo === null;
}
