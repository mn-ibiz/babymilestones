import { describe, expect, it } from "vitest";
import { toPackingSlip, type PackingSlip } from "./packing-slip.js";
import type { OnlineOrderMirrorRow } from "./woocommerce-orders.js";

/**
 * Story 29.3 (P4-E04-S03) — the pure packing-slip view-model that maps a local
 * `wc_orders` mirror row into the facts a packer needs to pack + dispatch:
 * Woo order number, customer name + phone, shipping address, delivery method,
 * line items + qty (qty mandatory), and the customer note. It carries NO price
 * totals (AC2 — a packing slip is not a receipt). It is built STRICTLY from the
 * stored mirror `payload` (AC4) — never a live Woo call — so the builder takes a
 * plain mirror row and has no Woo client in its signature.
 */

/** A representative Woo order payload (the superset Woo actually returns). */
function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1001,
    status: "processing",
    number: "1001",
    total: "4500.00",
    currency: "KES",
    billing: { first_name: "Asha", last_name: "Otieno", phone: "+254712345678" },
    shipping: {
      first_name: "Asha",
      last_name: "Otieno",
      address_1: "12 Riverside Drive",
      address_2: "Apt 4B",
      city: "Nairobi",
      state: "Nairobi",
      postcode: "00100",
      country: "KE",
    },
    shipping_lines: [{ method_id: "flat_rate", method_title: "Boda delivery" }],
    customer_note: "Leave at the gate, call on arrival.",
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

describe("toPackingSlip (Story 29.3 — AC2, AC4)", () => {
  it("carries the Woo order number", () => {
    expect(toPackingSlip(row()).orderNumber).toBe("1001");
  });

  it("falls back to the Woo order id when there is no human number", () => {
    expect(
      toPackingSlip(row({ number: null, payload: payload({ number: undefined }) })).orderNumber,
    ).toBe("1001");
  });

  it("carries the customer name + full phone (the packer must reach the customer)", () => {
    const slip = toPackingSlip(row());
    expect(slip.customerName).toBe("Asha Otieno");
    expect(slip.customerPhone).toBe("+254712345678");
  });

  it("builds the shipping address lines from the Woo shipping block (AC2)", () => {
    expect(toPackingSlip(row()).shippingAddress).toEqual([
      "12 Riverside Drive",
      "Apt 4B",
      "Nairobi, Nairobi 00100",
      "KE",
    ]);
  });

  it("reads the delivery method from the Woo shipping line (AC2)", () => {
    expect(toPackingSlip(row()).deliveryMethod).toBe("Boda delivery");
  });

  it("lists every line item with a mandatory quantity (AC2)", () => {
    expect(toPackingSlip(row()).items).toEqual([
      { name: "Baby carrier", quantity: 2 },
      { name: "Muslin wrap", quantity: 3 },
    ]);
  });

  it("carries the customer note / special instructions (AC2)", () => {
    expect(toPackingSlip(row()).customerNote).toBe("Leave at the gate, call on arrival.");
  });

  it("never carries price totals (AC2 — a packing slip is not a receipt)", () => {
    const slip = toPackingSlip(row()) as unknown as Record<string, unknown>;
    expect(slip).not.toHaveProperty("total");
    expect(slip).not.toHaveProperty("totalCents");
    expect(slip).not.toHaveProperty("subtotal");
    // No line carries a price either.
    for (const item of (slip.items as Record<string, unknown>[]) ?? []) {
      expect(item).not.toHaveProperty("price");
      expect(item).not.toHaveProperty("total");
    }
  });

  it("falls back to a 'Pickup in store' note when there is no shipping address (test hint)", () => {
    const slip = toPackingSlip(
      row({ payload: payload({ shipping: {}, shipping_lines: [] }) }),
    );
    expect(slip.shippingAddress).toEqual([]);
    expect(slip.pickupInStore).toBe(true);
    expect(slip.deliveryMethod).toBe("Pickup in store");
  });

  it("treats a shipping block with only a country as a pickup (no street address)", () => {
    const slip = toPackingSlip(row({ payload: payload({ shipping: { country: "KE" } }) }));
    expect(slip.pickupInStore).toBe(true);
  });

  it("degrades gracefully when the payload is missing optional fields", () => {
    const slip = toPackingSlip(row({ payload: { id: 7, status: "processing" }, wooOrderId: 7, number: null }));
    expect(slip.orderNumber).toBe("7");
    expect(slip.customerName).toBeNull();
    expect(slip.customerPhone).toBeNull();
    expect(slip.items).toEqual([]);
    expect(slip.customerNote).toBeNull();
    expect(slip.pickupInStore).toBe(true);
  });

  it("is built from the mirror row only — its signature takes no Woo client (AC4)", () => {
    // The builder is unary: it accepts the mirror row and nothing else, so a
    // print-time call can never reach for a live Woo client.
    expect(toPackingSlip.length).toBe(1);
  });

  it("returns a typed PackingSlip shape", () => {
    const slip: PackingSlip = toPackingSlip(row());
    expect(typeof slip.orderNumber).toBe("string");
  });
});
