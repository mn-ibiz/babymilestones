import { and, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { receiptLines, receipts } from "@bm/db";
import type { Executor } from "./services.js";
import {
  aggregateTaxReport,
  monthsInRange,
  type TaxLineInput,
  type TaxReport,
} from "./tax-report.js";

/**
 * P6-E07-S06 (Story 35.6) — DB read behind the tax-ready export. A thin projection:
 * for the selected `[fromDate, toDate]` (inclusive) range it loads the SETTLED,
 * NON-VOIDED `receipt_lines` and hands them to the pure {@link aggregateTaxReport}
 * reducer. Read-only — all arithmetic lives in the pure module.
 *
 * WINDOW. The receipt header's `created_at` is the settled-sale time (the receipt
 * is written at settlement). The inclusive calendar range `[fromDate, toDate]` maps
 * to the half-open instant window `[fromDate 00:00, (toDate+1) 00:00)` (UTC), the
 * same keying the revenue read model uses.
 *
 * SETTLED + NON-VOIDED (AC1). A `receipts` row exists only for a settled sale, so
 * every line is a settled supply. Voids are append-only reversing rows
 * (`kind='void'`, `reverses_receipt_id` → the original): a voided sale must NOT be
 * reported, so we exclude BOTH the void row (negated money) AND its original. The
 * surviving set is the `kind='normal'` receipts that no void reverses — exactly the
 * supplies that stand. (A refund on a non-receipt wallet flow does not appear in
 * `receipts`, so it neither adds nor removes here.)
 *
 * TAXABLE vs EXEMPT (AC1). Every line carries `line_tax`, stamped by the receipt
 * writer from the service's / product's `tax_treatment` (P1-E07-S04): VAT is
 * charged (line_tax ≠ 0) for `vat_inclusive` / `vat_exclusive`, and not charged
 * (line_tax = 0) for `vat_exempt` / `zero_rated`. So a line is VATable iff its
 * `line_tax` ≠ 0; its NET (taxable / exempt value) is `line_total − line_tax`. This
 * reads the figure the writer already stored, so it needs no join to the catalogue
 * (which a product line — no FK — could not guarantee anyway).
 */

export interface LoadTaxReportOpts {
  /** Inclusive range start (`YYYY-MM-DD`). */
  fromDate: string;
  /** Inclusive range end (`YYYY-MM-DD`). */
  toDate: string;
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` → the UTC start of that calendar day. */
function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** `YYYY-MM-DD` → the UTC start of the NEXT calendar day (exclusive upper bound). */
function nextDayStart(date: string): Date {
  return new Date(dayStart(date).getTime() + DAY_MS);
}

/**
 * Load the tax-ready report for the inclusive `[fromDate, toDate]` range (AC1):
 * taxable supplies, VAT charged, exempt supplies and total supplies, plus a
 * zero-filled per-month breakdown. Read-only — delegates all arithmetic to the
 * pure {@link aggregateTaxReport} reducer.
 */
export async function loadTaxReport(db: Executor, opts: LoadTaxReportOpts): Promise<TaxReport> {
  const rangeStart = dayStart(opts.fromDate);
  const rangeEnd = nextDayStart(opts.toDate);

  // Ids of originals that have been voided — a void row points at its original.
  const voidedOriginals = await db
    .select({ id: receipts.reversesReceiptId })
    .from(receipts)
    .where(and(eq(receipts.kind, "void"), isNotNull(receipts.reversesReceiptId)));
  const voidedSet = new Set(voidedOriginals.map((r) => r.id).filter((id): id is string => id != null));

  // SETTLED, NON-VOID receipt lines in the window. `kind='void'` rows are excluded
  // here; their originals are filtered out below (the void's reverses target).
  const rows = await db
    .select({
      receiptId: receipts.id,
      createdAt: receipts.createdAt,
      lineTax: receiptLines.lineTax,
      lineTotal: receiptLines.lineTotal,
    })
    .from(receiptLines)
    .innerJoin(receipts, eq(receipts.id, receiptLines.receiptId))
    .where(
      and(
        isNull(receipts.reversesReceiptId),
        eq(receipts.kind, "normal"),
        gte(receipts.createdAt, rangeStart),
        lt(receipts.createdAt, rangeEnd),
      ),
    );

  const months = monthsInRange(opts.fromDate, nextDayStart(opts.toDate).toISOString().slice(0, 10));

  const lines: TaxLineInput[] = rows
    .filter((r) => !voidedSet.has(r.receiptId))
    .map((r) => ({
      // Net (ex-VAT) value of the supply = gross line total − line tax.
      netCents: r.lineTotal - r.lineTax,
      taxCents: r.lineTax,
      // VAT charged (line_tax ≠ 0) ⇒ VATable; line_tax = 0 ⇒ exempt / zero-rated.
      vatable: r.lineTax !== 0,
      month: r.createdAt.toISOString().slice(0, 7),
    }));

  return aggregateTaxReport({ from: opts.fromDate, to: opts.toDate, lines, months });
}
