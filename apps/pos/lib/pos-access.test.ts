import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_PATH,
  POS_ROLES,
  SALE_SCREEN_PATH,
  canTakePayment,
  guardPosAccess,
  isPosRole,
  posLanding,
  surfaceLabel,
} from "./pos-access.js";

describe("POS access control (P2-E04-S01)", () => {
  describe("isPosRole", () => {
    it("admits the till-facing operator roles", () => {
      for (const role of POS_ROLES) {
        expect(isPosRole(role)).toBe(true);
      }
      expect(POS_ROLES).toEqual(["reception", "cashier", "packer"]);
    });

    it("rejects parents and admin-family roles", () => {
      for (const role of ["parent", "admin", "super_admin", "treasury", "accountant", ""]) {
        expect(isPosRole(role)).toBe(false);
      }
    });
  });

  describe("posLanding (AC2 — cashier lands on the sale screen)", () => {
    it("lands the cashier directly on the sale screen", () => {
      expect(posLanding("cashier")).toBe(SALE_SCREEN_PATH);
      expect(SALE_SCREEN_PATH).toBe("/");
    });

    it("lands every POS operator role on the sale screen", () => {
      for (const role of POS_ROLES) {
        expect(posLanding(role)).toBe(SALE_SCREEN_PATH);
      }
    });

    it("returns null for a role that may not use the POS", () => {
      expect(posLanding("admin")).toBeNull();
      expect(posLanding("parent")).toBeNull();
    });
  });

  describe("guardPosAccess (AC2 — role gating)", () => {
    it("allows a POS operator role", () => {
      expect(guardPosAccess("cashier")).toEqual({ ok: true });
    });

    it("forbids a non-POS role and routes to the 403 page", () => {
      expect(guardPosAccess("admin")).toEqual({
        ok: false,
        status: 403,
        redirectTo: FORBIDDEN_PATH,
      });
      expect(FORBIDDEN_PATH).toBe("/forbidden");
    });

    it("forbids an absent role (defensive)", () => {
      expect(guardPosAccess("").ok).toBe(false);
    });
  });

  describe("canTakePayment (mirrors the API create-payment gate)", () => {
    it("lets reception + cashier transact", () => {
      expect(canTakePayment("reception")).toBe(true);
      expect(canTakePayment("cashier")).toBe(true);
    });
    it("makes packer read-only (no payment)", () => {
      expect(canTakePayment("packer")).toBe(false);
    });
  });

  describe("surfaceLabel", () => {
    it("labels the till-facing surfaces", () => {
      expect(surfaceLabel("cashier")).toBe("Cashier");
      expect(surfaceLabel("reception")).toBe("Reception");
      expect(surfaceLabel("packer")).toBe("Packing");
    });

    it("falls back for non-POS roles", () => {
      expect(surfaceLabel("admin")).toBe("Unknown");
    });
  });
});
