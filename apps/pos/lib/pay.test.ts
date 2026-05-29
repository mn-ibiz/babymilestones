import { describe, expect, it } from "vitest";
import {
  POS_PAY_METHODS,
  changeDueCents,
  drawerMessage,
  isTenderSufficient,
  methodLabel,
  requiresCustomerPhone,
} from "./pay.js";

describe("POS pay helpers (P2-E04-S04)", () => {
  it("offers all four methods (AC1)", () => {
    expect(POS_PAY_METHODS).toEqual(["cash", "mpesa", "paystack", "wallet"]);
    expect(methodLabel("mpesa")).toMatch(/m-?pesa/iu);
  });

  describe("cash change (AC2)", () => {
    it("computes change as tendered − total, floored at 0", () => {
      expect(changeDueCents(2000, 2500)).toBe(500);
      expect(changeDueCents(2000, 2000)).toBe(0);
      expect(changeDueCents(2000, 1500)).toBe(0);
    });
    it("knows when tender is sufficient", () => {
      expect(isTenderSufficient(2000, 2000)).toBe(true);
      expect(isTenderSufficient(2000, 1999)).toBe(false);
    });
    it("gives a drawer instruction with the change", () => {
      expect(drawerMessage(500)).toMatch(/5\.00/u);
      expect(drawerMessage(0)).toMatch(/exact/iu);
    });
  });

  describe("phone requirement (AC3/AC5)", () => {
    it("requires a phone for M-Pesa and wallet, not cash/paystack", () => {
      expect(requiresCustomerPhone("mpesa")).toBe(true);
      expect(requiresCustomerPhone("wallet")).toBe(true);
      expect(requiresCustomerPhone("cash")).toBe(false);
      expect(requiresCustomerPhone("paystack")).toBe(false);
    });
  });
});
