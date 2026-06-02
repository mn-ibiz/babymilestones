import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { OnlineOrderCard } from "@bm/contracts";
import { OnlineOrders } from "./OnlineOrders";

/**
 * Story 29.1 (P4-E04-S01) — Online-orders queue render-contract tests in the POS
 * convention (no jsdom): the component takes `initialOrders` so the server-render
 * is deterministic, and we assert the markup. Covers the heading + filter chips
 * (AC4), the New-first ordering (AC2), the per-card fields — items + qty, customer
 * name, phone last-4 ONLY, delivery method, payment status (AC3) — the Woo id +
 * last-synced stamp (AC6), and the toggle-able alert tone control (AC2).
 */
function card(over: Partial<OnlineOrderCard> = {}): OnlineOrderCard {
  return {
    wooOrderId: 1001,
    number: "1001",
    localStatus: "new",
    items: [
      { name: "Baby carrier", quantity: 2 },
      { name: "Muslin wrap", quantity: 3 },
    ],
    itemCount: 5,
    customerName: "Asha Otieno",
    customerPhoneLast4: "••••5678",
    deliveryMethod: "Boda delivery",
    paymentStatus: "paid",
    paymentMethod: "M-Pesa",
    total: "4500.00",
    currency: "KES",
    lastSyncedAt: "2026-06-01T10:06:00.000Z",
    packingSlip: {
      orderNumber: "1001",
      customerName: "Asha Otieno",
      customerPhone: "+254712345678",
      shippingAddress: ["12 Riverside Drive", "Nairobi"],
      deliveryMethod: "Boda delivery",
      items: [
        { name: "Baby carrier", quantity: 2 },
        { name: "Muslin wrap", quantity: 3 },
      ],
      customerNote: null,
      pickupInStore: false,
    },
    ...over,
  };
}

function render(orders: OnlineOrderCard[]): string {
  return renderToStaticMarkup(<OnlineOrders initialOrders={orders} />);
}

describe("OnlineOrders queue (Story 29.1)", () => {
  it("is a client component function", () => {
    expect(typeof OnlineOrders).toBe("function");
  });

  it("renders the tab heading + the five filter chips (AC4)", () => {
    const html = render([card()]);
    expect(html).toContain("Online orders");
    expect(html).toContain("New");
    expect(html).toContain("Packing");
    expect(html).toContain("Ready");
    expect(html).toContain("Dispatched");
    expect(html).toContain("Fulfilled");
  });

  it("renders a card per order with items + qty, name, phone last-4, delivery + payment (AC3)", () => {
    const html = render([card()]);
    expect(html).toContain("2 × Baby carrier");
    expect(html).toContain("3 × Muslin wrap");
    expect(html).toContain("Asha Otieno");
    expect(html).toContain("••••5678");
    expect(html).not.toContain("254712345678"); // full phone NEVER shown (AC3)
    expect(html).toContain("Boda delivery");
    expect(html).toContain("Paid");
  });

  it("shows the source Woo order id + last-synced timestamp on each card (AC6)", () => {
    const html = render([card({ wooOrderId: 4242 })]);
    expect(html).toContain("4242");
    expect(html).toMatch(/synced/i);
  });

  it("renders New orders first (AC2)", () => {
    const html = render([
      card({ wooOrderId: 1, number: "1", localStatus: "fulfilled" }),
      card({ wooOrderId: 2, number: "2", localStatus: "new" }),
    ]);
    // The New card (Woo #2) markup must appear before the fulfilled card (Woo #1).
    const idxNew = html.indexOf("Woo #2");
    const idxFulfilled = html.indexOf("Woo #1");
    expect(idxNew).toBeGreaterThanOrEqual(0);
    expect(idxFulfilled).toBeGreaterThan(idxNew);
  });

  it("renders N orders across statuses with per-chip counts (unit: N per status)", () => {
    const html = render([
      card({ wooOrderId: 1, number: "1", localStatus: "new" }),
      card({ wooOrderId: 2, number: "2", localStatus: "new" }),
      card({ wooOrderId: 3, number: "3", localStatus: "packing" }),
    ]);
    // Three distinct order cards rendered (chip counts: New (2), Packing (1)).
    expect(html).toContain("Woo #1");
    expect(html).toContain("Woo #2");
    expect(html).toContain("Woo #3");
    expect(html).toContain("New (2)");
    expect(html).toContain("Packing (1)");
  });

  it("renders the toggle-able alert-tone control (AC2)", () => {
    const html = render([card({ localStatus: "new" })]);
    expect(html).toMatch(/alert tone/i);
    // The toggle is a real control the cashier can flip.
    expect(html).toContain('type="checkbox"');
  });

  it("renders an empty state when there are no orders", () => {
    const html = render([]);
    expect(html).toMatch(/no online orders/i);
  });

  // Story 29.3 (P4-E04-S03) — Print packing slip button on the order card.
  it("renders a 'Print packing slip' button on each order card (Story 29.3 AC1)", () => {
    const html = render([card()]);
    expect(html).toMatch(/print packing slip/i);
  });
});
