import { and, eq, lt, ne, sql } from "drizzle-orm";
import {
  bookings,
  floatAccounts,
  invoices,
  walletLedger,
  walletLedgerInvoiceSettlement,
} from "@bm/db";
import type { Executor } from "./services.js";
import {
  aggregateFloatVsRevenue,
  type FloatVsRevenue,
  type FloatVsRevenueDayInput,
} from "./float-vs-revenue.js";

/**
 * P5-E05-S04 (Story 35.4) — DB read behind the float-vs-revenue report.
 *
 * ON-THE-FLY read model — NO snapshot table. Every figure is RECONSTRUCTED from
 * data that already exists and is append-only/immutable, so a point-in-time
 * snapshot table would only ever be a denormalised cache:
 *
 *  - wallet liability as-of each day = Σ ALL `wallet_ledger.amount` with
 *    `created_at` ≤ end-of-day. The wallet balance is computed-never-stored
 *    (P1-E03-S02); the system-wide liability is the same SUM across every wallet,
 *    evaluated as-of each day. The ledger is append-only, so this is exact and
 *    fully reconstructable.
 *  - segregated (float/bank) balance as-of each day = Σ `float_accounts
 *    .opening_balance` + Σ float-TAGGED `wallet_ledger.amount` ≤ end-of-day. This
 *    is the same definition as the live reconciliation screen (P1-E06-S02) and the
 *    reconciliation export (P1-E06-S04), evaluated as-of each day. Untagged
 *    movements do not move it.
 *  - revenue earned that day = Σ non-cancelled booking `staffRateSnapshot` keyed
 *    by `checkedInAt`, net of in-day refunds — the SAME source as Epic 27's
 *    revenue read model (`revenue-by-period`), reduced to a single day.
 *
 * The per-day aggregates are grouped by a truncated UTC day in SQL and
 * accumulated forward in JS (the same forward-carry the reconciliation export
 * uses) to the as-of-day running totals. The pure {@link aggregateFloatVsRevenue}
 * reducer then derives the prior-day liability delta + the snapshot. Read-only.
 */
export interface LoadFloatVsRevenueOpts {
  /** Inclusive window end (`YYYY-MM-DD`, UTC) — the snapshot day. */
  to: string;
  /** Window length in days (AC2 defaults to 90); the window is `[to − days + 1, to]`. */
  days?: number;
}

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 90;

/** `YYYY-MM-DD` → the UTC start of that calendar day. */
function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Every `YYYY-MM-DD` in the inclusive window `[to − days + 1, to]`, ascending. */
function windowDays(to: string, days: number): string[] {
  const toMs = dayStart(to).getTime();
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    out.push(new Date(toMs - i * DAY_MS).toISOString().slice(0, 10));
  }
  return out;
}

/** Per-day-grouped net cents → a `day → cents` map keyed by truncated UTC day. */
type DailyMap = Map<string, number>;

/** Accumulate a day-grouped map forward across `days`, returning per-day running totals. */
function runningTotals(daily: DailyMap, days: readonly string[], base: number): Map<string, number> {
  const firstDay = days[0]!;
  let cum = base;
  // Pre-window carry: movements dated before the window's first day count toward
  // the as-of-day balance on that first day.
  for (const [day, cents] of daily) if (day < firstDay) cum += cents;
  const out = new Map<string, number>();
  for (const day of days) {
    cum += daily.get(day) ?? 0;
    out.set(day, cum);
  }
  return out;
}

export async function loadFloatVsRevenue(
  db: Executor,
  opts: LoadFloatVsRevenueOpts,
): Promise<FloatVsRevenue> {
  const days = windowDays(opts.to, Math.max(1, opts.days ?? DEFAULT_WINDOW_DAYS));
  // Exclusive end cut-off = midnight after the last window day (UTC).
  const windowEnd = new Date(dayStart(days[days.length - 1]!).getTime() + DAY_MS);

  // (a) ALL wallet-ledger movements per UTC day up to the window end → liability.
  const ledgerDailyRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${walletLedger.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      total: sql<string>`COALESCE(SUM(${walletLedger.amount}), 0)`,
    })
    .from(walletLedger)
    .where(lt(walletLedger.createdAt, windowEnd))
    .groupBy(sql`date_trunc('day', ${walletLedger.createdAt} AT TIME ZONE 'UTC')`);

  // (b) Float-TAGGED wallet-ledger movements per UTC day → segregated balance.
  const floatDailyRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${walletLedger.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      total: sql<string>`COALESCE(SUM(${walletLedger.amount}), 0)`,
    })
    .from(walletLedger)
    .where(and(lt(walletLedger.createdAt, windowEnd), sql`${walletLedger.floatAccountId} IS NOT NULL`))
    .groupBy(sql`date_trunc('day', ${walletLedger.createdAt} AT TIME ZONE 'UTC')`);

  // Σ float opening balances — the segregated balance's static baseline.
  const [openingRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${floatAccounts.openingBalance}), 0)` })
    .from(floatAccounts);
  const openingBalance = Number(openingRow?.total ?? 0);

  // (c) Gross booking revenue per UTC day (non-cancelled), keyed by checkedInAt.
  const revenueDailyRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${bookings.checkedInAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      total: sql<string>`COALESCE(SUM(${bookings.staffRateSnapshot}), 0)`,
    })
    .from(bookings)
    .where(and(lt(bookings.checkedInAt, windowEnd), ne(bookings.status, "cancelled")))
    .groupBy(sql`date_trunc('day', ${bookings.checkedInAt} AT TIME ZONE 'UTC')`);

  // (d) Refunds per UTC day (net the day's revenue down, Epic 27 source). A refund
  // reverses a check-in debit that settled an invoice; subtract its magnitude on
  // the day the refund happened.
  const refundDailyRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${walletLedger.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      total: sql<string>`COALESCE(SUM(${walletLedger.amount}), 0)`,
    })
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
    .where(and(eq(walletLedger.kind, "refund"), lt(walletLedger.createdAt, windowEnd)))
    .groupBy(sql`date_trunc('day', ${walletLedger.createdAt} AT TIME ZONE 'UTC')`);

  const ledgerDaily: DailyMap = new Map(ledgerDailyRows.map((r) => [r.day, Number(r.total)]));
  const floatDaily: DailyMap = new Map(floatDailyRows.map((r) => [r.day, Number(r.total)]));
  // Revenue + refunds are per-day flows (not running totals): refunds are a credit
  // (positive amount on the ledger), so subtract their magnitude from gross.
  const revenueByDay = new Map(revenueDailyRows.map((r) => [r.day, Number(r.total)]));
  const refundByDay = new Map(refundDailyRows.map((r) => [r.day, Math.abs(Number(r.total))]));

  const liabilityRunning = runningTotals(ledgerDaily, days, 0);
  const segregatedRunning = runningTotals(floatDaily, days, openingBalance);

  const dayInputs: FloatVsRevenueDayInput[] = days.map((date) => ({
    date,
    walletLiabilityCents: liabilityRunning.get(date) ?? 0,
    segregatedBalanceCents: segregatedRunning.get(date) ?? 0,
    revenueCents: (revenueByDay.get(date) ?? 0) - (refundByDay.get(date) ?? 0),
  }));

  return aggregateFloatVsRevenue({ from: days[0]!, to: opts.to, days: dayInputs });
}
