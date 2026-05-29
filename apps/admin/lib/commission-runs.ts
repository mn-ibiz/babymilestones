/**
 * Commission-run admin-console logic (P3-E01-S04/S05). Framework-free so it
 * unit-tests without React. The server owns the aggregation + claiming; this
 * shapes the date-range form and the run/preview display.
 */

export interface CommissionRunLine {
  staffId: string;
  staffNameSnapshot: string;
  amountCents: number;
}

export interface CommissionRunPreview {
  periodStart: string;
  periodEnd: string;
  totalCents: number;
  lines: CommissionRunLine[];
}

export interface CommissionRun {
  id: string;
  kind: "monthly" | "ad_hoc";
  periodStart: string;
  periodEnd: string;
  totalCents: number;
  paidOutAt: string | null;
  createdAt: string;
}

export interface DateRangeErrors {
  periodStart?: string;
  periodEnd?: string;
}

/** Validate an ad-hoc run's date range (AC1). End must be after start. */
export function validateRunRange(periodStart: string, periodEnd: string): DateRangeErrors {
  const errors: DateRangeErrors = {};
  const s = periodStart.trim();
  const e = periodEnd.trim();
  if (!s) errors.periodStart = "Start date is required";
  else if (Number.isNaN(new Date(s).getTime())) errors.periodStart = "Start must be a valid date";
  if (!e) errors.periodEnd = "End date is required";
  else if (Number.isNaN(new Date(e).getTime())) errors.periodEnd = "End must be a valid date";
  if (!errors.periodStart && !errors.periodEnd && new Date(e) <= new Date(s)) {
    errors.periodEnd = "End must be after start";
  }
  return errors;
}

/** Format integer cents as a KES amount string for display (no float math). */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const major = Math.trunc(abs / 100);
  const minor = String(abs % 100).padStart(2, "0");
  return `${sign}KES ${major.toLocaleString("en-KE")}.${minor}`;
}

/** Label for a run row: kind + period + paid-out badge. */
export function runLabel(run: CommissionRun): string {
  const paid = run.paidOutAt ? " · PAID OUT" : "";
  return `${run.kind} · ${run.periodStart.slice(0, 10)} → ${run.periodEnd.slice(0, 10)} · ${formatCents(run.totalCents)}${paid}`;
}

/** True when a run is still awaiting an external payout confirmation (S05 AC3). */
export function isAwaitingPayout(run: CommissionRun): boolean {
  return run.paidOutAt === null;
}

/** The payout-CSV download URL for a run (S05 AC1). */
export function payoutCsvUrl(baseUrl: string, runId: string): string {
  return `${baseUrl}/admin/commission-runs/${runId}/export.csv`;
}

/**
 * Whether the "Mark paid out" action should be offered for a run (S05 AC3): only
 * a run that has lines (total > 0) and is not already paid out can be marked.
 */
export function canMarkPaid(run: CommissionRun): boolean {
  return run.paidOutAt === null && run.totalCents > 0;
}
