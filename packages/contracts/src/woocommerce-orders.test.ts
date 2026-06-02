import { describe, expect, it } from "vitest";
import {
  ONLINE_ORDER_FILTERS,
  WC_LOCAL_STATUSES,
  maskPhoneLast4,
  toOnlineOrderCard,
  sortOnlineOrdersNewFirst,
  filterOnlineOrdersByStatus,
  type OnlineOrderMirrorRow,
} from "./woocommerce-orders.js";

/**
 * Story 29.1 (P4-E04-S01) — the pure view-model that maps local `wc_orders`
 * mirror rows into "Online orders" POS cards. No network, no Woo: every display
 * field is extracted from the stored `payload` (validated via the contracts Woo
 * order schema) at read time, the customer phone is masked to its last 4 digits,
 * New orders sort first, and the filter chips select by `local_status`.
 */

/** A representative Woo order payload (the superset Woo actually returns). */
function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1001,
    status: "processing",
    number: "1001",
    total: "4500.00",
    currency: "KES",
    date_created: "2026-06-01T10:00:00",
    date_modified: "2026-06-01T10:05:00",
    billing: { first_name: "Asha", last_name: "Otieno", phone: "+254712345678" },
    shipping_lines: [{ method_id: "flat_rate", method_title: "Boda delivery" }],
    payment_method: "mpesa",
    payment_method_title: "M-Pesa",
    date_paid: "2026-06-01T10:02:00",
    line_items: [
      { id: 1, name: "Baby carrier", quantity: 2 },
      { id: 2, name: "Muslin wrap", quantity: 3 },
    ],
    ...over,
  };
}

function row(over: Partial<OnlineOrderMirrorRow> = {}): OnlineOrderMirrorRow {
  return {
    wooOrderId: 1001,
    status: "processing",
    number: "1001",
    total: "4500.00",
    currency: "KES",
    localStatus: "new",
    payload: payload(),
    updatedAt: new Date("2026-06-01T10:06:00Z"),
    ...over,
  };
}

describe("maskPhoneLast4 (AC3 — phone last 4 only)", () => {
  it("keeps only the last 4 digits, masking the rest", () => {
    expect(maskPhoneLast4("+254712345678")).toBe("••••5678");
  });

  it("ignores non-digits when taking the last 4", () => {
    expect(maskPhoneLast4("0712 345 678")).toBe("••••5678");
  });

  it("returns null when there is no phone", () => {
    expect(maskPhoneLast4("")).toBeNull();
    expect(maskPhoneLast4(undefined)).toBeNull();
  });

  it("masks a short number without exposing more than the last 4", () => {
    expect(maskPhoneLast4("12")).toBe("12");
  });
});

describe("toOnlineOrderCard (AC3, AC5, AC6)", () => {
  it("extracts line items + qty from the payload", () => {
    const card = toOnlineOrderCard(row());
    expect(card.items).toEqual([
      { name: "Baby carrier", quantity: 2 },
      { name: "Muslin wrap", quantity: 3 },
    ]);
    expect(card.itemCount).toBe(5); // total qty across lines
  });

  it("builds the customer name from billing first + last name", () => {
    expect(toOnlineOrderCard(row()).customerName).toBe("Asha Otieno");
  });

  it("masks the customer phone to the last 4 digits only (AC3)", () => {
    expect(toOnlineOrderCard(row()).customerPhoneLast4).toBe("••••5678");
  });

  it("reads the delivery method from the Woo shipping line (AC3)", () => {
    expect(toOnlineOrderCard(row()).deliveryMethod).toBe("Boda delivery");
  });

  it("derives payment status as paid when the order has a date_paid (AC3)", () => {
    const card = toOnlineOrderCard(row());
    expect(card.paymentStatus).toBe("paid");
    expect(card.paymentMethod).toBe("M-Pesa");
  });

  it("derives payment status as unpaid when there is no date_paid", () => {
    const card = toOnlineOrderCard(row({ payload: payload({ date_paid: null }) }));
    expect(card.paymentStatus).toBe("unpaid");
  });

  it("surfaces the source Woo order id + last-synced timestamp (AC6)", () => {
    const card = toOnlineOrderCard(row());
    expect(card.wooOrderId).toBe(1001);
    expect(card.lastSyncedAt).toBe("2026-06-01T10:06:00.000Z");
  });

  it("carries the local workflow status + order number + total", () => {
    const card = toOnlineOrderCard(row());
    expect(card.localStatus).toBe("new");
    expect(card.number).toBe("1001");
    expect(card.total).toBe("4500.00");
    expect(card.currency).toBe("KES");
  });

  it("degrades gracefully when the payload is missing optional fields", () => {
    const card = toOnlineOrderCard(
      row({ payload: { id: 7, status: "processing" }, wooOrderId: 7 }),
    );
    expect(card.items).toEqual([]);
    expect(card.itemCount).toBe(0);
    expect(card.customerName).toBeNull();
    expect(card.customerPhoneLast4).toBeNull();
    expect(card.deliveryMethod).toBeNull();
    expect(card.paymentStatus).toBe("unpaid");
  });
});

describe("sortOnlineOrdersNewFirst (AC2 — New orders first)", () => {
  it("orders New-status cards ahead of every other status", () => {
    const cards = [
      toOnlineOrderCard(row({ wooOrderId: 1, localStatus: "fulfilled", payload: payload({ id: 1 }) })),
      toOnlineOrderCard(row({ wooOrderId: 2, localStatus: "new", payload: payload({ id: 2 }) })),
      toOnlineOrderCard(row({ wooOrderId: 3, localStatus: "packing", payload: payload({ id: 3 }) })),
    ];
    const sorted = sortOnlineOrdersNewFirst(cards);
    expect(sorted[0]!.localStatus).toBe("new");
  });

  it("within New, sorts newest-synced first", () => {
    const cards = [
      toOnlineOrderCard(
        row({ wooOrderId: 1, localStatus: "new", updatedAt: new Date("2026-06-01T09:00:00Z"), payload: payload({ id: 1 }) }),
      ),
      toOnlineOrderCard(
        row({ wooOrderId: 2, localStatus: "new", updatedAt: new Date("2026-06-01T11:00:00Z"), payload: payload({ id: 2 }) }),
      ),
    ];
    const sorted = sortOnlineOrdersNewFirst(cards);
    expect(sorted[0]!.wooOrderId).toBe(2);
  });
});

describe("filterOnlineOrdersByStatus (AC4 — filter chips)", () => {
  const cards = [
    toOnlineOrderCard(row({ wooOrderId: 1, localStatus: "new", payload: payload({ id: 1 }) })),
    toOnlineOrderCard(row({ wooOrderId: 2, localStatus: "packing", payload: payload({ id: 2 }) })),
    toOnlineOrderCard(row({ wooOrderId: 3, localStatus: "new", payload: payload({ id: 3 }) })),
  ];

  it("selects only cards matching the chosen chip", () => {
    const onlyNew = filterOnlineOrdersByStatus(cards, "new");
    expect(onlyNew.map((c) => c.wooOrderId).sort()).toEqual([1, 3]);
  });

  it("returns all cards when no status filter is applied", () => {
    expect(filterOnlineOrdersByStatus(cards, null)).toHaveLength(3);
  });
});

describe("filter chip + status vocabulary", () => {
  it("exposes the five workflow chips in order (AC4)", () => {
    expect(ONLINE_ORDER_FILTERS).toEqual(["new", "packing", "ready", "dispatched", "fulfilled"]);
  });

  it("enumerates every persisted local status including cancelled", () => {
    expect(WC_LOCAL_STATUSES).toContain("cancelled");
  });
});
