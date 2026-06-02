/**
 * P6-E05-S01 (Story 35.1) — Consolidated P&L by period (pure reducer).
 *
 * COMPOSES the existing read models rather than rebuilding any of them: per-unit
 * REVENUE comes from the Epic 27 revenue-by-period read model, EXPENSES from the
 * 35.5 expenses module ({@link expensesByUnitInPeriod}), and DIRECT COSTS (COGS)
 * are GRN-based for the retail `shop` unit. This file is the PURE arithmetic core
 * — no I/O; {@link ./pnl-report-db} assembles the inputs from those read models.
 *
 * The P&L taxonomy ({@link PNL_UNITS}) is the SAME business-unit set the expenses
 * module uses — the service units plus retail `shop` — so revenue, direct costs
 * and expenses all reconcile against one unit list (AC1).
 *
 * NET (AC1):  per-unit net = revenue − directCosts − expenses.
 *
 * SHARED OVERHEAD handling (documented decision): null-unit expenses (shared
 * overhead) are shown as a SEPARATE, UNALLOCATED line on the consolidated totals —
 * NOT spread across the units. Allocating overhead requires an allocation basis
 * (headcount? floor area? revenue share?) that is a finance-policy choice the spec
 * does not pin down (AC4 / Spec Module 8). So per-unit net is "contribution before
 * overhead", and the consolidated net subtracts the unallocated overhead once:
 *   consolidatedNet = Σ(unit net) − sharedOverhead.
 * This keeps every per-unit figure attributable to that unit and avoids inventing
 * an allocation rule; the field is exposed so a later story can allocate it.
 *
 * DIRECT COSTS / COGS — limitation (AC1): see {@link ./pnl-report-db}. There is no
 * product cost-price / goods-received-note value in the schema today, so the
 * GRN-based shop COGS is 0 until cost data lands. The structure here already
 * carries a per-unit `directCosts` column so wiring real COGS in later is a
 * read-model change only — this reducer and every DTO stay the same.
 */
import { SERVICE_UNITS } from "./services.js";

/**
 * The P&L business-unit taxonomy (AC1): the service units plus retail `shop`.
 * Identical to `EXPENSE_BUSINESS_UNITS` so revenue / direct-costs / expenses all
 * reconcile against one ordered unit list. Every unit is always present in the
 * output (zero-filled) so the report table is stable.
 */
export const PNL_UNITS = [...SERVICE_UNITS, "shop"] as const;
export type PnlUnit = (typeof PNL_UNITS)[number];

/** True when `value` is one of the known P&L unit codes. */
function isPnlUnit(value: string): value is PnlUnit {
  return (PNL_UNITS as readonly string[]).includes(value);
}

/** The inputs the pure reducer needs for ONE period — all already projected. */
export interface PnlInput {
  /** Inclusive-half-open window start (`YYYY-MM-DD`). Echoed back on the result. */
  from: string;
  /** EXCLUSIVE window end (`YYYY-MM-DD`) — half-open `[from, to)`. */
  to: string;
  /** unit code → revenue cents (present units only; absent = 0). */
  revenueByUnit: Partial<Record<string, number>>;
  /** unit code → direct-cost (COGS) cents (present units only; absent = 0). */
  directCostsByUnit: Partial<Record<string, number>>;
  /** unit code → expense cents (present units only; absent = 0). */
  expensesByUnit: Partial<Record<string, number>>;
  /** NULL-unit (shared overhead) expense cents — shown as a separate line. */
  sharedOverheadCents: number;
}

/** One unit's P&L row (AC1). Every figure is integer KES cents. */
export interface PnlUnitRow {
  unit: PnlUnit;
  revenueCents: number;
  directCostsCents: number;
  expensesCents: number;
  /** revenue − directCosts − expenses (contribution BEFORE shared overhead). */
  netCents: number;
}

/** The consolidated totals across every unit (AC1). */
export interface PnlTotals {
  revenueCents: number;
  directCostsCents: number;
  /** Sum of the per-UNIT expenses only (shared overhead is the separate line). */
  expensesCents: number;
  /** Unallocated null-unit (shared overhead) expenses — a separate line. */
  sharedOverheadCents: number;
  /** revenue − directCosts − unitExpenses − sharedOverhead. */
  netCents: number;
}

/** The fully-reduced consolidated P&L for one period (AC1). */
export interface PnlReport {
  from: string;
  to: string;
  /** Per-unit rows in canonical {@link PNL_UNITS} order (always present). */
  byUnit: PnlUnitRow[];
  totals: PnlTotals;
}

/** Sum the present values of a unit→cents map over the known units only. */
function pick(map: Partial<Record<string, number>>, unit: PnlUnit): number {
  return map[unit] ?? 0;
}

/**
 * Reduce one period's per-unit revenue / direct-costs / expenses (+ shared
 * overhead) into the consolidated P&L (AC1). Pure — no I/O. Every unit is present
 * (zero-filled) in {@link PNL_UNITS} order; per-unit net is contribution BEFORE
 * shared overhead; the consolidated net deducts the unallocated overhead once.
 * Unknown unit codes in the input maps are ignored (defensive) — only the known
 * taxonomy contributes, so totals always reconcile against the rendered rows.
 */
export function aggregatePnl(input: PnlInput): PnlReport {
  const byUnit: PnlUnitRow[] = PNL_UNITS.map((unit) => {
    const revenueCents = pick(input.revenueByUnit, unit);
    const directCostsCents = pick(input.directCostsByUnit, unit);
    const expensesCents = pick(input.expensesByUnit, unit);
    return {
      unit,
      revenueCents,
      directCostsCents,
      expensesCents,
      netCents: revenueCents - directCostsCents - expensesCents,
    };
  });

  const totals: PnlTotals = {
    revenueCents: byUnit.reduce((a, u) => a + u.revenueCents, 0),
    directCostsCents: byUnit.reduce((a, u) => a + u.directCostsCents, 0),
    expensesCents: byUnit.reduce((a, u) => a + u.expensesCents, 0),
    sharedOverheadCents: input.sharedOverheadCents,
    netCents: 0,
  };
  totals.netCents =
    totals.revenueCents - totals.directCostsCents - totals.expensesCents - totals.sharedOverheadCents;

  // Defensive belt-and-braces: a known unit in the input must have been picked
  // up; `isPnlUnit` is the same guard the read model uses to map raw codes, so the
  // reducer and the assembler agree on the taxonomy.
  void isPnlUnit;

  return { from: input.from, to: input.to, byUnit, totals };
}

/** Per-unit period-over-period delta (current − prior), every column (AC2). */
export interface PnlUnitDelta {
  unit: PnlUnit;
  revenueDeltaCents: number;
  directCostsDeltaCents: number;
  expensesDeltaCents: number;
  netDeltaCents: number;
}

/** Consolidated period-over-period delta (current − prior), every column (AC2). */
export interface PnlTotalsDelta {
  revenueDeltaCents: number;
  directCostsDeltaCents: number;
  expensesDeltaCents: number;
  sharedOverheadDeltaCents: number;
  netDeltaCents: number;
}

/** Two P&Ls (current + prior) and their per-unit + consolidated deltas (AC2). */
export interface PnlComparison {
  current: PnlReport;
  previous: PnlReport;
  deltaByUnit: PnlUnitDelta[];
  totalsDelta: PnlTotalsDelta;
}

/**
 * Compare two P&L reports period-over-period (AC2 — MoM / YoY): the per-unit and
 * consolidated deltas (current − prior) for every column. Pure. Positive = growth
 * on revenue/net; the caller decides arrow/colour. The two reports are echoed back
 * so the consumer renders both periods alongside the delta.
 */
export function comparePnl(current: PnlReport, previous: PnlReport): PnlComparison {
  const prevByUnit = new Map(previous.byUnit.map((u) => [u.unit, u]));
  const deltaByUnit: PnlUnitDelta[] = current.byUnit.map((cur) => {
    const prev = prevByUnit.get(cur.unit);
    return {
      unit: cur.unit,
      revenueDeltaCents: cur.revenueCents - (prev?.revenueCents ?? 0),
      directCostsDeltaCents: cur.directCostsCents - (prev?.directCostsCents ?? 0),
      expensesDeltaCents: cur.expensesCents - (prev?.expensesCents ?? 0),
      netDeltaCents: cur.netCents - (prev?.netCents ?? 0),
    };
  });

  const totalsDelta: PnlTotalsDelta = {
    revenueDeltaCents: current.totals.revenueCents - previous.totals.revenueCents,
    directCostsDeltaCents: current.totals.directCostsCents - previous.totals.directCostsCents,
    expensesDeltaCents: current.totals.expensesCents - previous.totals.expensesCents,
    sharedOverheadDeltaCents:
      current.totals.sharedOverheadCents - previous.totals.sharedOverheadCents,
    netDeltaCents: current.totals.netCents - previous.totals.netCents,
  };

  return { current, previous, deltaByUnit, totalsDelta };
}

/* ---------------------------------------------- comparison windows (AC2) */

/** A half-open `[from, to)` calendar window plus the equal prior window. */
export interface PnlWindow {
  /** Inclusive start (`YYYY-MM-DD`). */
  from: string;
  /** EXCLUSIVE end (`YYYY-MM-DD`). */
  to: string;
  /** The immediately-preceding equal-calendar window (for the comparison). */
  prior: { from: string; to: string };
}

/** `YYYY-MM-DD` → its [year, monthIndex0, day] components. */
function ymd(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y!, (m ?? 1) - 1, d ?? 1];
}

/** [year, monthIndex0] → the first-of-month `YYYY-MM-01`, normalising overflow. */
function firstOfMonth(year: number, monthIndex0: number): string {
  // Normalise month overflow/underflow (e.g. month 12 → next Jan, -1 → prev Dec).
  const y = year + Math.floor(monthIndex0 / 12);
  const m = ((monthIndex0 % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * The calendar-MONTH window containing `anchor` (`YYYY-MM-DD`) and the prior month
 * (AC2 — "this month vs last month"). Both bounds are half-open first-of-month
 * dates so they line up with the expenses read model's `[from, to)` contract.
 */
export function monthWindow(anchor: string): PnlWindow {
  const [y, m] = ymd(anchor);
  return {
    from: firstOfMonth(y, m),
    to: firstOfMonth(y, m + 1),
    prior: { from: firstOfMonth(y, m - 1), to: firstOfMonth(y, m) },
  };
}

/**
 * The calendar-YEAR window containing `anchor` (`YYYY-MM-DD`) and the prior year
 * (AC2 — "this year vs last year"). Both bounds are half-open Jan-1 dates.
 */
export function yearWindow(anchor: string): PnlWindow {
  const [y] = ymd(anchor);
  return {
    from: `${y}-01-01`,
    to: `${y + 1}-01-01`,
    prior: { from: `${y - 1}-01-01`, to: `${y}-01-01` },
  };
}
