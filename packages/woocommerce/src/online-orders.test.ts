import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { wcOrders } from "@bm/db";
import { listOnlineOrders } from "./online-orders.js";

/**
 * Story 29.1 (P4-E04-S01) — the POS Online-orders read query. It reads ONLY from
 * the local `wc_orders` mirror (AC5 — never a live Woo call), shapes each row into
 * a card via the contracts view-model, and returns them New-first (AC2). No Woo
 * client is injected here — the query has no way to reach Woo, by construction.
 */
describe("listOnlineOrders (Story 29.1)", () => {
  let dbh: TestDb;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  function payload(id: number, over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id,
      status: "processing",
      number: String(id),
      total: "1000.00",
      currency: "KES",
      billing: { first_name: "Asha", last_name: "Otieno", phone: "+254712345678" },
      shipping_lines: [{ method_id: "flat_rate", method_title: "Boda delivery" }],
      payment_method_title: "M-Pesa",
      date_paid: "2026-06-01T10:02:00",
      line_items: [{ id: 1, name: "Baby carrier", quantity: 2 }],
      ...over,
    };
  }

  async function seed(id: number, localStatus: string, updatedAt: string) {
    await dbh.db.insert(wcOrders).values({
      wooOrderId: id,
      status: "processing",
      number: String(id),
      total: "1000.00",
      currency: "KES",
      localStatus: localStatus as never,
      payload: payload(id),
      updatedAt: new Date(updatedAt),
    });
  }

  it("returns mirror rows as cards, New-first (AC2, AC5)", async () => {
    await seed(1, "fulfilled", "2026-06-01T09:00:00Z");
    await seed(2, "new", "2026-06-01T10:00:00Z");
    await seed(3, "packing", "2026-06-01T11:00:00Z");

    const cards = await listOnlineOrders(dbh.db);
    expect(cards).toHaveLength(3);
    expect(cards[0]!.localStatus).toBe("new");
    expect(cards[0]!.wooOrderId).toBe(2);
  });

  it("extracts display fields from the payload (AC3) and masks the phone", async () => {
    await seed(10, "new", "2026-06-01T10:00:00Z");
    const [card] = await listOnlineOrders(dbh.db);
    expect(card!.customerName).toBe("Asha Otieno");
    expect(card!.customerPhoneLast4).toBe("••••5678");
    expect(card!.deliveryMethod).toBe("Boda delivery");
    expect(card!.paymentStatus).toBe("paid");
    expect(card!.items).toEqual([{ name: "Baby carrier", quantity: 2 }]);
  });

  it("carries the source Woo id + last-synced timestamp (AC6)", async () => {
    await seed(42, "new", "2026-06-01T10:00:00Z");
    const [card] = await listOnlineOrders(dbh.db);
    expect(card!.wooOrderId).toBe(42);
    expect(card!.lastSyncedAt).toBe("2026-06-01T10:00:00.000Z");
  });

  it("returns an empty list when the mirror is empty", async () => {
    expect(await listOnlineOrders(dbh.db)).toEqual([]);
  });
});
