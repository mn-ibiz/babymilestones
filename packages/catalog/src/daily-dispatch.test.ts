import { describe, expect, it } from "vitest";
import {
  aggregateDailyDispatch,
  DISPATCH_LOCAL_STATUSES,
  type DailyDispatchEventRow,
  type DailyDispatchOrderRow,
} from "./daily-dispatch.js";

/**
 * P4-E04-S04 (Story 29.4) — daily dispatch report aggregation. Pure reducer over
 * the day's WooCommerce-originated orders (`wc_orders`) + their transition log
 * (`order_events`). Verifies: counts by `local_status`, total value (KES cents),
 * average pack time (new→ready) and dispatch time (ready→dispatched) computed from
 * the FIRST forward transition timestamps, and the documented edge-case rules.
 *
 * PACK/DISPATCH-TIME RULE (documented):
 *   - pack time     = firstReached('ready')     − firstForwardOut('new')
 *   - dispatch time = firstReached('dispatched') − firstReached('ready')
 *   We use the FIRST forward transition timestamp for each milestone, so a later
 *   manual REVERSAL (e.g. ready→packing then forward to ready again) never moves
 *   the milestone — the original forward time stands.
 *   - An order missing either endpoint of an average is EXCLUDED from that average
 *     only (it still counts in the status counts + total value).
 *   - A cancelled order contributes to the status counts + total value but, having
 *     no `ready`/`dispatched` milestones, is naturally excluded from the averages.
 */

const T = (iso: string) => new Date(iso);

function order(over: Partial<DailyDispatchOrderRow> = {}): DailyDispatchOrderRow {
  return {
    wooOrderId: 1,
    localStatus: "fulfilled",
    totalCents: 0,
    ...over,
  };
}

function ev(over: Partial<DailyDispatchEventRow> = {}): DailyDispatchEventRow {
  return {
    wooOrderId: 1,
    fromStatus: "new",
    toStatus: "packing",
    kind: "forward",
    createdAt: T("2026-06-02T08:00:00.000Z"),
    ...over,
  };
}

describe("aggregateDailyDispatch — counts + total value (Story 29.4 AC2)", () => {
  it("counts orders by local_status (every status zero-filled) and sums total value", () => {
    const report = aggregateDailyDispatch({
      date: "2026-06-02",
      orders: [
        order({ wooOrderId: 1, localStatus: "new", totalCents: 100_00 }),
        order({ wooOrderId: 2, localStatus: "packing", totalCents: 250_50 }),
        order({ wooOrderId: 3, localStatus: "dispatched", totalCents: 49_50 }),
        order({ wooOrderId: 4, localStatus: "dispatched", totalCents: 0 }),
      ],
      events: [],
      syncHealthCount: 0,
    });

    expect(report.date).toBe("2026-06-02");
    const counts = Object.fromEntries(report.countsByStatus.map((c) => [c.status, c.count]));
    expect(counts.new).toBe(1);
    expect(counts.packing).toBe(1);
    expect(counts.ready).toBe(0); // zero-filled
    expect(counts.dispatched).toBe(2);
    expect(counts.fulfilled).toBe(0);
    expect(counts.cancelled).toBe(0);
    // Every status is present in canonical order.
    expect(report.countsByStatus.map((c) => c.status)).toEqual([...DISPATCH_LOCAL_STATUSES]);
    expect(report.totalOrders).toBe(4);
    expect(report.totalValueCents).toBe(100_00 + 250_50 + 49_50 + 0);
  });

  it("is a zero-data day: all counts 0, total 0, averages null", () => {
    const report = aggregateDailyDispatch({
      date: "2026-06-02",
      orders: [],
      events: [],
      syncHealthCount: 0,
    });
    expect(report.totalOrders).toBe(0);
    expect(report.totalValueCents).toBe(0);
    expect(report.avgPackSeconds).toBeNull();
    expect(report.avgDispatchSeconds).toBeNull();
    expect(report.countsByStatus.every((c) => c.count === 0)).toBe(true);
  });
});

describe("aggregateDailyDispatch — pack/dispatch averages (Story 29.4 AC2)", () => {
  it("averages pack time (new→ready) and dispatch time (ready→dispatched) over fully-tracked orders", () => {
    const report = aggregateDailyDispatch({
      date: "2026-06-02",
      orders: [
        order({ wooOrderId: 1, localStatus: "dispatched", totalCents: 0 }),
        order({ wooOrderId: 2, localStatus: "dispatched", totalCents: 0 }),
      ],
      events: [
        // Order 1: new→packing@08:00, packing→ready@08:10 (pack 600s), ready→dispatched@08:40 (dispatch 1800s).
        ev({ wooOrderId: 1, fromStatus: "new", toStatus: "packing", createdAt: T("2026-06-02T08:00:00Z") }),
        ev({ wooOrderId: 1, fromStatus: "packing", toStatus: "ready", createdAt: T("2026-06-02T08:10:00Z") }),
        ev({ wooOrderId: 1, fromStatus: "ready", toStatus: "dispatched", createdAt: T("2026-06-02T08:40:00Z") }),
        // Order 2: new→ready directly@09:00 from 08:40 out-of-new... use new→packing@09:00, →ready@09:20 (pack 1200s), →dispatched@09:30 (dispatch 600s).
        ev({ wooOrderId: 2, fromStatus: "new", toStatus: "packing", createdAt: T("2026-06-02T09:00:00Z") }),
        ev({ wooOrderId: 2, fromStatus: "packing", toStatus: "ready", createdAt: T("2026-06-02T09:20:00Z") }),
        ev({ wooOrderId: 2, fromStatus: "ready", toStatus: "dispatched", createdAt: T("2026-06-02T09:30:00Z") }),
      ],
      syncHealthCount: 0,
    });
    // pack: (600 + 1200) / 2 = 900s; dispatch: (1800 + 600) / 2 = 1200s.
    expect(report.avgPackSeconds).toBe(900);
    expect(report.avgDispatchSeconds).toBe(1200);
  });

  it("uses the FIRST forward transition timestamps even when an order was reversed", () => {
    const report = aggregateDailyDispatch({
      date: "2026-06-02",
      orders: [order({ wooOrderId: 1, localStatus: "dispatched", totalCents: 0 })],
      events: [
        ev({ wooOrderId: 1, fromStatus: "new", toStatus: "packing", createdAt: T("2026-06-02T08:00:00Z") }),
        // First reach ready at 08:10 (pack = 600s).
        ev({ wooOrderId: 1, fromStatus: "packing", toStatus: "ready", createdAt: T("2026-06-02T08:10:00Z") }),
        // A manual reversal back to packing, then forward to ready again much later — must be IGNORED.
        ev({ wooOrderId: 1, fromStatus: "ready", toStatus: "packing", kind: "reversal", createdAt: T("2026-06-02T08:20:00Z") }),
        ev({ wooOrderId: 1, fromStatus: "packing", toStatus: "ready", createdAt: T("2026-06-02T08:50:00Z") }),
        // First reach dispatched at 09:10 (dispatch = first ready 08:10 → 09:10 = 3600s).
        ev({ wooOrderId: 1, fromStatus: "ready", toStatus: "dispatched", createdAt: T("2026-06-02T09:10:00Z") }),
      ],
      syncHealthCount: 0,
    });
    expect(report.avgPackSeconds).toBe(600); // first new→ready, ignores reversal
    expect(report.avgDispatchSeconds).toBe(3600); // first ready → first dispatched
  });

  it("excludes an order missing the ready milestone from the pack average (but not from counts)", () => {
    const report = aggregateDailyDispatch({
      date: "2026-06-02",
      orders: [
        order({ wooOrderId: 1, localStatus: "dispatched", totalCents: 10_00 }),
        order({ wooOrderId: 2, localStatus: "packing", totalCents: 20_00 }),
      ],
      events: [
        // Fully tracked order.
        ev({ wooOrderId: 1, fromStatus: "new", toStatus: "packing", createdAt: T("2026-06-02T08:00:00Z") }),
        ev({ wooOrderId: 1, fromStatus: "packing", toStatus: "ready", createdAt: T("2026-06-02T08:05:00Z") }),
        ev({ wooOrderId: 1, fromStatus: "ready", toStatus: "dispatched", createdAt: T("2026-06-02T08:15:00Z") }),
        // Order 2 left new but never reached ready — excluded from pack avg.
        ev({ wooOrderId: 2, fromStatus: "new", toStatus: "packing", createdAt: T("2026-06-02T08:00:00Z") }),
      ],
      syncHealthCount: 0,
    });
    expect(report.avgPackSeconds).toBe(300); // only order 1: 300s
    expect(report.avgDispatchSeconds).toBe(600); // only order 1: 600s
    // Order 2 still counted.
    expect(report.totalOrders).toBe(2);
    expect(report.totalValueCents).toBe(30_00);
  });

  it("excludes a cancelled mid-flight order from the averages but keeps it in counts + value", () => {
    const report = aggregateDailyDispatch({
      date: "2026-06-02",
      orders: [
        order({ wooOrderId: 1, localStatus: "cancelled", totalCents: 99_00 }),
        order({ wooOrderId: 2, localStatus: "dispatched", totalCents: 1_00 }),
      ],
      events: [
        // Order 1 went new→packing then cancelled — never reached ready.
        ev({ wooOrderId: 1, fromStatus: "new", toStatus: "packing", createdAt: T("2026-06-02T08:00:00Z") }),
        ev({ wooOrderId: 1, fromStatus: "packing", toStatus: "cancelled", kind: "cancel", createdAt: T("2026-06-02T08:30:00Z") }),
        // Order 2 fully tracked.
        ev({ wooOrderId: 2, fromStatus: "new", toStatus: "packing", createdAt: T("2026-06-02T08:00:00Z") }),
        ev({ wooOrderId: 2, fromStatus: "packing", toStatus: "ready", createdAt: T("2026-06-02T08:02:00Z") }),
        ev({ wooOrderId: 2, fromStatus: "ready", toStatus: "dispatched", createdAt: T("2026-06-02T08:12:00Z") }),
      ],
      syncHealthCount: 0,
    });
    const counts = Object.fromEntries(report.countsByStatus.map((c) => [c.status, c.count]));
    expect(counts.cancelled).toBe(1);
    expect(counts.dispatched).toBe(1);
    expect(report.totalValueCents).toBe(100_00);
    // Averages reflect only the fully-tracked order 2.
    expect(report.avgPackSeconds).toBe(120);
    expect(report.avgDispatchSeconds).toBe(600);
  });

  it("carries the sync-health count straight through", () => {
    const report = aggregateDailyDispatch({
      date: "2026-06-02",
      orders: [],
      events: [],
      syncHealthCount: 3,
    });
    expect(report.syncHealthCount).toBe(3);
  });
});
