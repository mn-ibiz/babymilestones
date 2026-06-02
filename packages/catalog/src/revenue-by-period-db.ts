import { and, eq, gte, lt, ne } from "drizzle-orm";
import {
  bookings,
  invoices,
  services,
  walletLedger,
  walletLedgerInvoiceSettlement,
} from "@bm/db";
import type { Executor } from "./services.js";
import type { ServiceUnit } from "./services.js";
import {
  aggregateRevenueByPeriod,
  precedingPeriod,
  type RevenueBookingRow,
  type RevenueByPeriod,
  type RevenuePeriodRows,
  type RevenueRefundRow,
} from "./revenue-by-period.js";

/**
 * P3-E05-S02 (Story 27.2) — DB read behind the revenue-by-unit-by-period report.
 * A thin projection: for the selected `[from, to]` range AND the immediately-
 * preceding equal-length period it loads (a) the non-cancelled bookings' revenue
 * joined to their service unit and (b) the refunds attributed to each unit, then
 * hands both to the pure {@link aggregateRevenueByPeriod} reducer. Read-only.
 *
 * Boundaries are UTC `[from 00:00, (to+1) 00:00)` — the inclusive calendar range
 * `[from, to]` — on the booking's `checkedInAt` (the visit time the booking write
 * path sets), matching 27.1's "today" keying extended to a range.
 *
 * REVENUE = booking `staffRateSnapshot` for every non-cancelled booking (the same
 * source 27.1 + staff-earnings read). NET revenue subtracts refunds (AC3): a
 * refund is a `wallet_ledger` row (`kind='refund'`, `reverses_entry_id` → the
 * check-in debit) whose debit settled an invoice (`wallet_ledger_invoice_settlement
 * .kind='checkin'`); that invoice's booking carries the service unit. A refund is
 * attributed to the period in which the REFUND happened (its `created_at`), so the
 * net figure reflects refund activity within the selected window.
 */
export interface LoadRevenueByPeriodOpts {
  /** Inclusive range start (`YYYY-MM-DD`). */
  from: string;
  /** Inclusive range end (`YYYY-MM-DD`). */
  to: string;
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

/** Load the booking-revenue + refund rows for one inclusive `[from, to]` range. */
async function loadPeriodRows(
  db: Executor,
  from: string,
  to: string,
): Promise<RevenuePeriodRows> {
  const rangeStart = dayStart(from);
  const rangeEnd = nextDayStart(to);

  // Non-cancelled bookings in range, joined to their service unit.
  const bookingRows = await db
    .select({ unit: services.unit, revenueCents: bookings.staffRateSnapshot })
    .from(bookings)
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        gte(bookings.checkedInAt, rangeStart),
        lt(bookings.checkedInAt, rangeEnd),
        ne(bookings.status, "cancelled"),
      ),
    );

  const bookingsOut: RevenueBookingRow[] = bookingRows.map((r) => ({
    unit: (r.unit as ServiceUnit | null) ?? null,
    revenueCents: r.revenueCents,
  }));

  // Refunds whose refund row falls in range, chained back to the unit of the
  // booking whose check-in debit they reverse:
  //   wallet_ledger(refund) → reverses → check-in debit
  //   → settlement(kind='checkin').invoiceId → bookings.invoiceId → services.unit
  const refundRows = await db
    .select({ unit: services.unit, refundCents: walletLedger.amount })
    .from(walletLedger)
    .innerJoin(
      walletLedgerInvoiceSettlement,
      and(
        eq(walletLedgerInvoiceSettlement.ledgerEntryId, walletLedger.reversesEntryId),
        eq(walletLedgerInvoiceSettlement.kind, "checkin"),
      ),
    )
    .innerJoin(invoices, eq(invoices.id, walletLedgerInvoiceSettlement.invoiceId))
    .innerJoin(bookings, eq(bookings.invoiceId, invoices.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        eq(walletLedger.kind, "refund"),
        gte(walletLedger.createdAt, rangeStart),
        lt(walletLedger.createdAt, rangeEnd),
      ),
    );

  const refundsOut: RevenueRefundRow[] = refundRows.map((r) => ({
    unit: (r.unit as ServiceUnit | null) ?? null,
    // A refund is a credit (positive on the ledger); subtract its magnitude.
    refundCents: Math.abs(r.refundCents),
  }));

  return { bookings: bookingsOut, refunds: refundsOut };
}

/**
 * Load the revenue-by-unit-by-period report (AC1/AC3): the selected period's
 * per-unit net revenue + total, the preceding equal-length period's, and the
 * period-over-period delta. Read-only — delegates all arithmetic to the pure
 * {@link aggregateRevenueByPeriod} reducer.
 */
export async function loadRevenueByPeriod(
  db: Executor,
  opts: LoadRevenueByPeriodOpts,
): Promise<RevenueByPeriod> {
  const prev = precedingPeriod(opts.from, opts.to);
  const [current, previous] = await Promise.all([
    loadPeriodRows(db, opts.from, opts.to),
    loadPeriodRows(db, prev.from, prev.to),
  ]);
  return aggregateRevenueByPeriod({ from: opts.from, to: opts.to, current, previous });
}
