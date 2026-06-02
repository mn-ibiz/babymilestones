/**
 * P3-E05-S02 (Story 27.2) — Revenue by unit, by period.
 *
 * Owner-facing revenue trends: per-unit NET revenue over an arbitrary date range,
 * plus the period-over-period delta against the immediately-preceding equal-length
 * period (AC1). Builds directly on 27.1's per-unit revenue definition
 * ({@link aggregateOperationsDashboard}) — REVENUE is the booking's
 * `staffRateSnapshot` summed for every non-cancelled booking, bucketed by the
 * service's `unit` — and extends it from "today" to an arbitrary `[from, to]`
 * range and from GROSS to NET by subtracting refunded amounts (AC3).
 *
 * The pure {@link aggregateRevenueByPeriod} reducer takes the period's already-
 * projected booking-revenue + refund rows (the DB read does the joins) and returns
 * a per-unit series (chart-ready, every unit zero-filled in {@link SERVICE_UNITS}
 * order), the total, the previous period's per-unit + total, and the delta per
 * unit + total. No I/O — exhaustively unit-tested, the same split 27.1 uses.
 *
 * REFUND attribution: a refund is a reversing `wallet_ledger` row whose original
 * debit settled an invoice (`wallet_ledger_invoice_settlement.kind = 'checkin'`);
 * that invoice's booking carries the service `unit`. The DB read resolves the
 * unit; here we simply subtract the refunded cents from that unit's gross revenue.
 */
import { SERVICE_UNITS, type ServiceUnit } from "./services.js";

/** One booking's revenue contribution within a period, bucketed by unit. */
export interface RevenueBookingRow {
  /** The booking's service unit, or null when the service is unknown/missing. */
  unit: ServiceUnit | null;
  /** The booking's invoiced amount snapshot in integer KES cents. */
  revenueCents: number;
}

/** One refund's amount within a period, attributed to a service unit. */
export interface RevenueRefundRow {
  /** The unit of the booking the refunded debit settled, or null when unknown. */
  unit: ServiceUnit | null;
  /** Refunded magnitude in integer KES cents (always positive). */
  refundCents: number;
}

/** The booking-revenue + refund rows for one period (current or previous). */
export interface RevenuePeriodRows {
  bookings: readonly RevenueBookingRow[];
  refunds: readonly RevenueRefundRow[];
}

/** Inputs the period aggregation reduces — the DB read hands these in. */
export interface RevenuePeriodInput {
  /** Inclusive range start (`YYYY-MM-DD`). Echoed back on the result. */
  from: string;
  /** Inclusive range end (`YYYY-MM-DD`). Echoed back on the result. */
  to: string;
  /** Booking-revenue + refund rows for the selected period. */
  current: RevenuePeriodRows;
  /** The same for the immediately-preceding equal-length period (for the delta). */
  previous: RevenuePeriodRows;
}

/** Net revenue for one unit over the period (always present, zero-filled). */
export interface UnitPeriodRevenue {
  unit: ServiceUnit;
  /** Net revenue (gross bookings − refunds) for this unit, integer cents. */
  revenueCents: number;
}

/** Period-over-period delta for one unit: this period − previous period. */
export interface UnitPeriodDelta {
  unit: ServiceUnit;
  /** thisPeriod − previousPeriod (cents). Positive = growth, negative = decline. */
  deltaCents: number;
}

/** The fully-reduced revenue-by-unit-by-period report (AC1/AC3). */
export interface RevenueByPeriod {
  from: string;
  to: string;
  /** This period's net revenue per unit (chart series), in SERVICE_UNITS order. */
  byUnit: UnitPeriodRevenue[];
  /** This period's net total (sums {@link byUnit}). */
  totalCents: number;
  /** The previous (preceding equal-length) period's net revenue per unit. */
  previousByUnit: UnitPeriodRevenue[];
  /** The previous period's net total. */
  previousTotalCents: number;
  /** Per-unit delta (this − previous), in SERVICE_UNITS order. */
  deltaByUnit: UnitPeriodDelta[];
  /** Total delta (this total − previous total). */
  totalDeltaCents: number;
}

/** Reduce one period's rows to a per-unit net map + net total. */
function netByUnit(rows: RevenuePeriodRows): { byUnit: Map<ServiceUnit, number>; total: number } {
  const byUnit = new Map<ServiceUnit, number>(SERVICE_UNITS.map((u) => [u, 0]));
  let total = 0;
  for (const b of rows.bookings) {
    total += b.revenueCents;
    if (b.unit !== null) byUnit.set(b.unit, (byUnit.get(b.unit) ?? 0) + b.revenueCents);
  }
  for (const r of rows.refunds) {
    total -= r.refundCents;
    if (r.unit !== null) byUnit.set(r.unit, (byUnit.get(r.unit) ?? 0) - r.refundCents);
  }
  return { byUnit, total };
}

/**
 * Reduce the period's booking-revenue + refund rows to the per-unit net series,
 * total, and the period-over-period delta against the supplied previous period
 * (AC1/AC3). Pure — no I/O. Every unit is always present (zero-filled) so the
 * chart renders a stable series; net revenue subtracts refunds (AC3); the delta
 * is `thisPeriod − previousPeriod` per unit + total (positive = growth).
 */
export function aggregateRevenueByPeriod(inputData: RevenuePeriodInput): RevenueByPeriod {
  const cur = netByUnit(inputData.current);
  const prev = netByUnit(inputData.previous);

  return {
    from: inputData.from,
    to: inputData.to,
    byUnit: SERVICE_UNITS.map((unit) => ({ unit, revenueCents: cur.byUnit.get(unit) ?? 0 })),
    totalCents: cur.total,
    previousByUnit: SERVICE_UNITS.map((unit) => ({
      unit,
      revenueCents: prev.byUnit.get(unit) ?? 0,
    })),
    previousTotalCents: prev.total,
    deltaByUnit: SERVICE_UNITS.map((unit) => ({
      unit,
      deltaCents: (cur.byUnit.get(unit) ?? 0) - (prev.byUnit.get(unit) ?? 0),
    })),
    totalDeltaCents: cur.total - prev.total,
  };
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` → ms at UTC midnight. */
function dayMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

/** ms at UTC midnight → `YYYY-MM-DD`. */
function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The immediately-preceding equal-length period for a `[from, to]` range (AC1).
 * For an N-day period the previous period is the N days ending the day before
 * `from`: `[from − N, to − N]`. Both bounds are inclusive `YYYY-MM-DD`.
 */
export function precedingPeriod(from: string, to: string): { from: string; to: string } {
  const fromMs = dayMs(from);
  const toMs = dayMs(to);
  const lengthMs = toMs - fromMs + DAY_MS; // inclusive length
  return { from: isoDay(fromMs - lengthMs), to: isoDay(toMs - lengthMs) };
}
