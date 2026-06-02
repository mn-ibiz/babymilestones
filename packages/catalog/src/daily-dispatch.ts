/**
 * P4-E04-S04 (Story 29.4) — Daily dispatch report.
 *
 * Shop-ops end-of-day summary of ONLINE (WooCommerce-originated) orders dispatched
 * and still pending. Builds on the wc_orders projection (29.1) + the order_events
 * transition log (29.2). In-store POS sales are explicitly OUT of scope — they have
 * their own end-of-day (P2-E04-S05); this report reduces ONLY the `wc_orders` set.
 *
 * The pure {@link aggregateDailyDispatch} reducer takes the day's already-projected
 * order rows + their transition events + the sync-health (dead-letter) count (the DB
 * read does the queries) and returns: a count per `local_status` (zero-filled), the
 * total order count + total value (KES cents), the average pack time (new→ready) and
 * dispatch time (ready→dispatched) in whole seconds, and the sync-health count. No
 * I/O — exhaustively unit-tested, the same split the reporting stories use.
 *
 * PACK / DISPATCH-TIME RULE (the documented contract for the edge cases in AC2):
 *   - pack time     = firstReached('ready')      − firstForwardOut('new')
 *   - dispatch time = firstReached('dispatched') − firstReached('ready')
 *   Each milestone uses the EARLIEST forward-transition timestamp, so a later manual
 *   REVERSAL (e.g. ready→packing→ready again) never moves the milestone — the first
 *   forward time stands.
 *   - Negative or zero-length intervals are discarded (clock skew / out-of-order),
 *     and an order missing either endpoint of an average is EXCLUDED from THAT
 *     average only (it still counts in the status counts + total value).
 *   - A cancelled mid-flight order keeps its status count + total value but, lacking
 *     the ready/dispatched milestones, is naturally excluded from the averages.
 */

/** The six POS workflow statuses, in canonical ladder order (counts are zero-filled). */
export const DISPATCH_LOCAL_STATUSES = [
  "new",
  "packing",
  "ready",
  "dispatched",
  "fulfilled",
  "cancelled",
] as const;

export type DispatchLocalStatus = (typeof DISPATCH_LOCAL_STATUSES)[number];

/** One WooCommerce-originated order in the report window (already projected). */
export interface DailyDispatchOrderRow {
  wooOrderId: number;
  /** The POS workflow status (Story 29.1) this order currently sits in. */
  localStatus: DispatchLocalStatus;
  /** The order value in integer KES cents (parsed from Woo's decimal `total`). */
  totalCents: number;
}

/** One local order-status transition (Story 29.2) for an order in the window. */
export interface DailyDispatchEventRow {
  wooOrderId: number;
  fromStatus: DispatchLocalStatus;
  toStatus: DispatchLocalStatus;
  /** forward / cancel / reversal (Story 29.2). */
  kind: "forward" | "cancel" | "reversal";
  createdAt: Date;
}

/** Inputs the daily aggregation reduces — the DB read hands these in. */
export interface DailyDispatchInput {
  /** The report day (`YYYY-MM-DD`). Echoed back on the result. */
  date: string;
  /** The day's WooCommerce-originated orders. */
  orders: readonly DailyDispatchOrderRow[];
  /** The transition events for those orders (any timestamp). */
  events: readonly DailyDispatchEventRow[];
  /** Count of un-actioned dead-letter writebacks (AC5 — the sync-health row). */
  syncHealthCount: number;
}

/** One status bucket of the report (always present, zero-filled). */
export interface DispatchStatusCount {
  status: DispatchLocalStatus;
  count: number;
}

/** The fully-reduced daily dispatch report (AC2/AC5). */
export interface DailyDispatchReport {
  date: string;
  /** Order count per local_status, in canonical order (zero-filled). */
  countsByStatus: DispatchStatusCount[];
  /** Total number of WooCommerce orders in the window. */
  totalOrders: number;
  /** Total order value in integer KES cents. */
  totalValueCents: number;
  /** Average pack time (new→ready), whole seconds, or null when no order qualifies. */
  avgPackSeconds: number | null;
  /** Average dispatch time (ready→dispatched), whole seconds, or null. */
  avgDispatchSeconds: number | null;
  /** Count of stuck/failed Woo writebacks in the dead-letter (AC5). */
  syncHealthCount: number;
}

/** Per-order earliest milestone timestamps derived from the FIRST forward transition. */
interface OrderMilestones {
  /** Earliest moment the order left `new` (first event with `from_status = 'new'`). */
  leftNew?: number;
  /** Earliest moment the order first reached `ready`. */
  reachedReady?: number;
  /** Earliest moment the order first reached `dispatched`. */
  reachedDispatched?: number;
}

/** Keep the EARLIEST timestamp for a milestone (first-forward-wins). */
function keepEarliest(current: number | undefined, candidate: number): number {
  return current === undefined ? candidate : Math.min(current, candidate);
}

/**
 * Reduce the day's orders + transition events + the sync-health count to the status
 * counts, total value, and the pack/dispatch averages (AC2/AC5). Pure — no I/O.
 * Every status is present (zero-filled). See the file header for the documented
 * pack/dispatch-time rule used for reversed / cancelled / missing-timestamp orders.
 */
export function aggregateDailyDispatch(inputData: DailyDispatchInput): DailyDispatchReport {
  // Counts (zero-filled) + total value.
  const counts = new Map<DispatchLocalStatus, number>(DISPATCH_LOCAL_STATUSES.map((s) => [s, 0]));
  let totalValueCents = 0;
  const trackedOrderIds = new Set<number>();
  for (const o of inputData.orders) {
    counts.set(o.localStatus, (counts.get(o.localStatus) ?? 0) + 1);
    totalValueCents += o.totalCents;
    trackedOrderIds.add(o.wooOrderId);
  }

  // Milestones from the FIRST forward transition timestamps (reversals ignored).
  const milestones = new Map<number, OrderMilestones>();
  const milestoneFor = (wooOrderId: number): OrderMilestones => {
    let m = milestones.get(wooOrderId);
    if (!m) {
      m = {};
      milestones.set(wooOrderId, m);
    }
    return m;
  };

  for (const e of inputData.events) {
    // Only consider events for orders actually in the report window.
    if (!trackedOrderIds.has(e.wooOrderId)) continue;
    const ts = e.createdAt.getTime();
    if (Number.isNaN(ts)) continue;
    const m = milestoneFor(e.wooOrderId);
    if (e.fromStatus === "new") m.leftNew = keepEarliest(m.leftNew, ts);
    if (e.toStatus === "ready") m.reachedReady = keepEarliest(m.reachedReady, ts);
    if (e.toStatus === "dispatched") m.reachedDispatched = keepEarliest(m.reachedDispatched, ts);
  }

  // Averages — accumulate only the strictly-positive, fully-bounded intervals.
  let packSum = 0;
  let packN = 0;
  let dispatchSum = 0;
  let dispatchN = 0;
  for (const m of milestones.values()) {
    if (m.leftNew !== undefined && m.reachedReady !== undefined) {
      const pack = m.reachedReady - m.leftNew;
      if (pack > 0) {
        packSum += pack;
        packN += 1;
      }
    }
    if (m.reachedReady !== undefined && m.reachedDispatched !== undefined) {
      const dispatch = m.reachedDispatched - m.reachedReady;
      if (dispatch > 0) {
        dispatchSum += dispatch;
        dispatchN += 1;
      }
    }
  }

  return {
    date: inputData.date,
    countsByStatus: DISPATCH_LOCAL_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 })),
    totalOrders: inputData.orders.length,
    totalValueCents,
    avgPackSeconds: packN > 0 ? Math.round(packSum / packN / 1000) : null,
    avgDispatchSeconds: dispatchN > 0 ? Math.round(dispatchSum / dispatchN / 1000) : null,
    syncHealthCount: inputData.syncHealthCount,
  };
}
