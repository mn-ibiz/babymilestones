import { describe, expect, it } from "vitest";
import type { OnlineOrderCard } from "@bm/contracts";
import {
  ONLINE_ORDER_CHIPS,
  chipLabel,
  statusLabel,
  countByStatus,
  hasNewOrders,
  formatItemSummary,
} from "./online-orders.js";

const card = (over: Partial<OnlineOrderCard> = {}): OnlineOrderCard => ({
  wooOrderId: 1,
  number: "1",
  localStatus: "new",
  items: [{ name: "Baby carrier", quantity: 2 }],
  itemCount: 2,
  customerName: "Asha Otieno",
  customerPhoneLast4: "••••5678",
  deliveryMethod: "Boda delivery",
  paymentStatus: "paid",
  paymentMethod: "M-Pesa",
  total: "1000.00",
  currency: "KES",
  lastSyncedAt: "2026-06-01T10:00:00.000Z",
  packingSlip: {
    orderNumber: "1",
    customerName: "Asha Otieno",
    customerPhone: "+254712345678",
    shippingAddress: ["12 Riverside Drive", "Nairobi"],
    deliveryMethod: "Boda delivery",
    items: [{ name: "Baby carrier", quantity: 2 }],
    customerNote: null,
    pickupInStore: false,
  },
  ...over,
});

describe("POS Online-orders helpers (Story 29.1)", () => {
  describe("chips (AC4)", () => {
    it("exposes the five workflow chips in order", () => {
      expect(ONLINE_ORDER_CHIPS).toEqual(["new", "packing", "ready", "dispatched", "fulfilled"]);
    });
    it("gives each chip a human label", () => {
      expect(chipLabel("new")).toBe("New");
      expect(chipLabel("dispatched")).toBe("Dispatched");
    });
  });

  describe("statusLabel", () => {
    it("labels every workflow status including cancelled", () => {
      expect(statusLabel("packing")).toBe("Packing");
      expect(statusLabel("cancelled")).toBe("Cancelled");
    });
  });

  describe("countByStatus (per-chip badge)", () => {
    it("counts cards per local status", () => {
      const counts = countByStatus([
        card({ wooOrderId: 1, localStatus: "new" }),
        card({ wooOrderId: 2, localStatus: "new" }),
        card({ wooOrderId: 3, localStatus: "packing" }),
      ]);
      expect(counts.new).toBe(2);
      expect(counts.packing).toBe(1);
      expect(counts.ready).toBe(0);
    });
  });

  describe("hasNewOrders (drives the alert tone — AC2)", () => {
    it("is true when at least one card is New", () => {
      expect(hasNewOrders([card({ localStatus: "new" })])).toBe(true);
    });
    it("is false when no card is New", () => {
      expect(hasNewOrders([card({ localStatus: "packing" })])).toBe(false);
      expect(hasNewOrders([])).toBe(false);
    });
  });

  describe("formatItemSummary (AC3)", () => {
    it("summarises a line as 'qty × name'", () => {
      expect(formatItemSummary({ name: "Baby carrier", quantity: 2 })).toBe("2 × Baby carrier");
    });
  });
});
