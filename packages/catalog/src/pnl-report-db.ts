import type { Executor } from "./services.js";
import { loadRevenueByPeriod } from "./revenue-by-period-db.js";
import { expensesByUnitInPeriod } from "./expenses.js";
import {
  aggregatePnl,
  comparePnl,
  monthWindow,
  yearWindow,
  type PnlComparison,
  type PnlInput,
  type PnlReport,
} from "./pnl-report.js";

/**
 * P6-E05-S01 (Story 35.1) — DB read behind the consolidated P&L. A thin assembler:
 * for each of the current + prior calendar windows (month or year) it COMPOSES the
 * three existing read models and hands the projected per-unit maps to the pure
 * {@link aggregatePnl} reducer, then {@link comparePnl} for the period-over-period
 * deltas (AC2). Read-only — all arithmetic lives in the pure module.
 *
 *   REVENUE      — the Epic 27 {@link loadRevenueByPeriod} read model, reused as-is.
 *   EXPENSES     — the 35.5 {@link expensesByUnitInPeriod} read model, reused as-is.
 *   DIRECT COSTS — GRN-based shop COGS via {@link shopCogsByUnitInPeriod} (see below).
 *
 * Window contract: the P&L windows are HALF-OPEN `[from, to)` (first-of-month /
 * Jan-1 bounds — see {@link monthWindow}/{@link yearWindow}) which is exactly the
 * expenses read model's contract. The revenue read model instead takes an
 * INCLUSIVE `[from, to]` range keyed on `checkedInAt`, so we convert by passing the
 * last included day (`to − 1 day`) as its inclusive end. The two read models then
 * cover the identical set of calendar days.
 *
 * ── DIRECT COSTS / COGS LIMITATION (AC1) ──────────────────────────────────────
 * There is NO product cost-price or goods-received-note (GRN) value in the schema
 * today: `products` carries only a SELL price (`price_cents`); the goods-received
 * stock adjustment ({@link ../stock-adjustments}) records a quantity delta on an
 * audit row with NO cost. So GRN-based shop COGS cannot be computed yet and direct
 * costs are reported as 0 (NOT fabricated). {@link shopCogsByUnitInPeriod} is the
 * single seam where real COGS plugs in once a product cost-price (or a GRN cost
 * table) lands: it returns a per-unit cents map, today always empty. The pure
 * reducer + every DTO already carry a `directCosts` column, so wiring real COGS in
 * later is a change to THIS function only — nothing downstream moves.
 */

export type PnlGranularity = "month" | "year";

export interface LoadPnlReportOpts {
  /** Any `YYYY-MM-DD` inside the period of interest (today, typically). */
  anchor: string;
  /** `month` → this month vs last month; `year` → this year vs last year (AC2). */
  granularity: PnlGranularity;
}

const DAY_MS = 86_400_000;

/** Half-open exclusive end `YYYY-MM-DD` → the last INCLUDED day (`to − 1 day`). */
function inclusiveEnd(exclusiveTo: string): string {
  const ms = Date.parse(`${exclusiveTo}T00:00:00.000Z`) - DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * GRN-based direct costs (COGS) for the retail `shop` unit over a half-open
 * `[from, to)` period — the per-unit direct-cost map the P&L subtracts (AC1).
 *
 * LIMITATION (documented above): no product cost-price / GRN cost exists in the
 * schema, so this returns an EMPTY map today (shop COGS = 0) rather than a
 * fabricated figure. This is the single seam where real COGS — `POS sale qty ×
 * unit cost` for the period — plugs in once cost data lands. Read-only.
 */
export async function shopCogsByUnitInPeriod(
  _db: Executor,
  _from: string,
  _to: string,
): Promise<Partial<Record<string, number>>> {
  // No cost-price / GRN data in the schema yet — see the LIMITATION note. Returning
  // an empty map keeps direct costs at 0 without inventing a number.
  return {};
}

/** Assemble ONE period's pure P&L input by composing the three read models. */
async function loadPeriod(db: Executor, from: string, to: string): Promise<PnlReport> {
  const [revenue, expenses, directCostsByUnit] = await Promise.all([
    loadRevenueByPeriod(db, { from, to: inclusiveEnd(to) }),
    expensesByUnitInPeriod(db, from, to),
    shopCogsByUnitInPeriod(db, from, to),
  ]);

  const revenueByUnit: Partial<Record<string, number>> = {};
  for (const u of revenue.byUnit) revenueByUnit[u.unit] = u.revenueCents;

  const input: PnlInput = {
    from,
    to,
    revenueByUnit,
    directCostsByUnit,
    expensesByUnit: expenses.perUnit,
    sharedOverheadCents: expenses.sharedOverheadCents,
  };
  return aggregatePnl(input);
}

/**
 * Load the consolidated P&L for the anchor's calendar window + the prior equal
 * window, with the period-over-period comparison (AC1/AC2). Read-only — delegates
 * all arithmetic to the pure {@link aggregatePnl} / {@link comparePnl}.
 */
export async function loadPnlReport(
  db: Executor,
  opts: LoadPnlReportOpts,
): Promise<PnlComparison> {
  const window = opts.granularity === "year" ? yearWindow(opts.anchor) : monthWindow(opts.anchor);
  const [current, previous] = await Promise.all([
    loadPeriod(db, window.from, window.to),
    loadPeriod(db, window.prior.from, window.prior.to),
  ]);
  return comparePnl(current, previous);
}
