/**
 * P6-E07-S06 (Story 35.6) — Tax-ready exports (pure reducer).
 *
 * Produces a per-period VAT summary for settled sales: TAXABLE SUPPLIES, VAT
 * CHARGED and EXEMPT SUPPLIES (AC1) — the three figures a VAT-3 return wants —
 * plus the total supplies and an optional per-month breakdown within the range.
 *
 * This file is the PURE arithmetic core — no I/O. {@link ./tax-report-db} loads
 * the settled, non-voided receipt lines from `receipts` / `receipt_lines` and
 * hands each one here as `{ netCents, taxCents, vatable }`.
 *
 * THE TAXABLE / EXEMPT SPLIT (AC1). Every receipt line carries a tax treatment
 * (the service's / product's `tax_treatment` — P1-E07-S04): `vat_inclusive` /
 * `vat_exclusive` charge VAT (VATable), while `vat_exempt` / `zero_rated` do not.
 * The receipt writer stamps `line_tax` accordingly. So:
 *   - a VATable line contributes its NET (ex-VAT value) to TAXABLE SUPPLIES and
 *     its `line_tax` to VAT CHARGED;
 *   - a non-VATable line contributes its net to EXEMPT SUPPLIES, no VAT.
 * Total supplies = taxable + exempt (the ex-VAT value supplied). The `vatable`
 * flag is computed by the DB layer (from the line tax / tax treatment) so this
 * reducer stays a pure bucket-and-sum.
 *
 * All amounts are integer KES cents (no float drift), like the wallet ledger and
 * the receipt money columns.
 */

/** A `YYYY-MM` calendar month tag. */
export type Month = string;

/** One settled receipt line, already net/tax-split + flagged VATable (AC1). */
export interface TaxLineInput {
  /** NET (ex-VAT) value of the line, integer cents. */
  netCents: number;
  /** VAT charged on the line, integer cents (0 for exempt / zero-rated lines). */
  taxCents: number;
  /** True when the line's tax treatment charges VAT (vat_inclusive / vat_exclusive). */
  vatable: boolean;
  /** Optional `YYYY-MM` the line falls in — drives the per-month breakdown. */
  month?: Month;
}

/** The three VAT figures for a window (AC1), plus the total supplies. */
export interface TaxBucket {
  /** Σ net of VATable lines — the ex-VAT value of standard-rated supplies (AC1). */
  taxableSuppliesCents: number;
  /** Σ line tax — the output VAT charged (AC1). */
  vatChargedCents: number;
  /** Σ net of non-VATable (exempt / zero-rated) lines (AC1). */
  exemptSuppliesCents: number;
  /** taxable + exempt — the total ex-VAT value supplied. */
  totalSuppliesCents: number;
}

/** One month's tax bucket within the range (per-period breakdown). */
export interface TaxMonthRow extends TaxBucket {
  /** The `YYYY-MM` this row covers. */
  month: Month;
}

/** The fully-reduced tax report for one period (AC1). */
export interface TaxReport extends TaxBucket {
  /** Inclusive-half-open window start (`YYYY-MM-DD`). Echoed from the input. */
  from: string;
  /** EXCLUSIVE window end (`YYYY-MM-DD`) — half-open `[from, to)`. */
  to: string;
  /** Per-month breakdown in ascending order, present iff months were supplied. */
  byMonth?: TaxMonthRow[];
}

/** Inputs to {@link aggregateTaxReport} — one period's settled lines. */
export interface TaxReportInput {
  from: string;
  to: string;
  /** Settled, non-voided receipt lines in `[from, to)`. */
  lines: readonly TaxLineInput[];
  /**
   * Optional ascending `YYYY-MM` months in the range. When supplied, every month
   * is present (zero-filled) in the breakdown so the table is stable; absent =
   * no breakdown emitted.
   */
  months?: readonly Month[];
}

/** A fresh, zeroed bucket. */
function emptyBucket(): TaxBucket {
  return {
    taxableSuppliesCents: 0,
    vatChargedCents: 0,
    exemptSuppliesCents: 0,
    totalSuppliesCents: 0,
  };
}

/** Fold one line into a bucket (mutates + returns it). */
function addLine(bucket: TaxBucket, l: TaxLineInput): TaxBucket {
  if (l.vatable) {
    bucket.taxableSuppliesCents += l.netCents;
    bucket.vatChargedCents += l.taxCents;
  } else {
    bucket.exemptSuppliesCents += l.netCents;
  }
  bucket.totalSuppliesCents = bucket.taxableSuppliesCents + bucket.exemptSuppliesCents;
  return bucket;
}

/**
 * Reduce one period's settled lines into the tax report (AC1): taxable supplies,
 * VAT charged, exempt supplies and total supplies. Pure — no I/O. When `months`
 * is supplied, a zero-filled per-month breakdown is produced (ascending); the
 * whole-period totals always reconcile against the months. A line whose `month`
 * is not in the supplied list still counts toward the period totals (defensive)
 * but lands in no month row.
 */
export function aggregateTaxReport(input: TaxReportInput): TaxReport {
  const overall = emptyBucket();
  const byMonth = input.months
    ? new Map<Month, TaxBucket>(input.months.map((m) => [m, emptyBucket()]))
    : null;

  for (const l of input.lines) {
    addLine(overall, l);
    if (byMonth && l.month) {
      const row = byMonth.get(l.month);
      if (row) addLine(row, l);
    }
  }

  const report: TaxReport = { from: input.from, to: input.to, ...overall };
  if (input.months) {
    report.byMonth = input.months.map((month) => ({ month, ...byMonth!.get(month)! }));
  }
  return report;
}

/** `YYYY-MM-DD` → `[year, monthIndex0]`. */
function ymParts(date: string): [number, number] {
  const [y, m] = date.split("-").map(Number);
  return [y!, (m ?? 1) - 1];
}

/**
 * Every `YYYY-MM` whose first-of-month falls in the half-open `[from, to)` range,
 * ascending. Used to zero-fill the per-month breakdown so empty months still
 * appear. An empty / inverted range yields no months.
 */
export function monthsInRange(from: string, to: string): Month[] {
  const [fy, fm] = ymParts(from);
  const [ty, tm] = ymParts(to);
  const out: Month[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m < tm)) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}
