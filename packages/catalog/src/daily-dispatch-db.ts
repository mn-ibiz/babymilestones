import { and, gte, inArray, lt, eq } from "drizzle-orm";
import { orderEvents, wcOrders, wcOutboxDead } from "@bm/db";
import type { Executor } from "./services.js";
import {
  aggregateDailyDispatch,
  type DailyDispatchEventRow,
  type DailyDispatchOrderRow,
  type DailyDispatchReport,
  type DispatchLocalStatus,
} from "./daily-dispatch.js";

/**
 * P4-E04-S04 (Story 29.4) — DB read behind the daily dispatch report. A thin
 * projection: for the chosen calendar day it loads (a) the WooCommerce-originated
 * orders (`wc_orders`) created that day, (b) their transition events (`order_events`)
 * for the pack/dispatch timings, and (c) the count of un-actioned dead-letter rows
 * (`wc_outbox_dead`, status='dead') for the sync-health row — then hands all three
 * to the pure {@link aggregateDailyDispatch} reducer. Read-only; no live Woo call.
 *
 * DAY BOUNDARY: UTC `[date 00:00, date+1 00:00)` keyed on `wc_orders.created_at`
 * (when the order entered our system / was pulled), mirroring the reporting stories'
 * day keying. Events are loaded for those orders regardless of when they occurred,
 * so a pack/dispatch milestone the next morning is still attributed correctly.
 *
 * SCOPE: `wc_orders` IS exactly the WooCommerce-originated set (AC1) — in-store POS
 * sales live in separate tables and are never read here.
 */
export interface LoadDailyDispatchOpts {
  /** The report day (`YYYY-MM-DD`). */
  date: string;
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` → the UTC start of that calendar day. */
function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Parse Woo's decimal `total` string (KES, e.g. "1234.56" / "100" / null) to integer
 * KES cents. Defensive: non-numeric / null → 0; rounds to the nearest cent.
 */
export function wooTotalToCents(total: string | null): number {
  if (total === null || total.trim() === "") return 0;
  const n = Number(total);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Load the daily dispatch report for `opts.date` (AC1/AC2/AC5). Read-only. */
export async function loadDailyDispatch(
  db: Executor,
  opts: LoadDailyDispatchOpts,
): Promise<DailyDispatchReport> {
  const rangeStart = dayStart(opts.date);
  const rangeEnd = new Date(rangeStart.getTime() + DAY_MS);

  // (a) The day's WooCommerce-originated orders.
  const orderRows = await db
    .select({
      wooOrderId: wcOrders.wooOrderId,
      localStatus: wcOrders.localStatus,
      total: wcOrders.total,
    })
    .from(wcOrders)
    .where(and(gte(wcOrders.createdAt, rangeStart), lt(wcOrders.createdAt, rangeEnd)));

  const orders: DailyDispatchOrderRow[] = orderRows.map((r) => ({
    wooOrderId: r.wooOrderId,
    localStatus: r.localStatus as DispatchLocalStatus,
    totalCents: wooTotalToCents(r.total),
  }));

  // (b) Their transition events (only when there are orders to key on).
  const orderIds = orders.map((o) => o.wooOrderId);
  const eventRows = orderIds.length
    ? await db
        .select({
          wooOrderId: orderEvents.wooOrderId,
          fromStatus: orderEvents.fromStatus,
          toStatus: orderEvents.toStatus,
          kind: orderEvents.kind,
          createdAt: orderEvents.createdAt,
        })
        .from(orderEvents)
        .where(inArray(orderEvents.wooOrderId, orderIds))
    : [];

  const events: DailyDispatchEventRow[] = eventRows.map((r) => ({
    wooOrderId: r.wooOrderId,
    fromStatus: r.fromStatus as DispatchLocalStatus,
    toStatus: r.toStatus as DispatchLocalStatus,
    kind: r.kind as DailyDispatchEventRow["kind"],
    createdAt: r.createdAt,
  }));

  // (c) Un-actioned dead-letter rows for the sync-health row (AC5).
  const deadRows = await db
    .select({ id: wcOutboxDead.id })
    .from(wcOutboxDead)
    .where(eq(wcOutboxDead.status, "dead"));

  return aggregateDailyDispatch({
    date: opts.date,
    orders,
    events,
    syncHealthCount: deadRows.length,
  });
}
