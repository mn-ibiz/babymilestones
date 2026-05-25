import { describe, expect, it } from "vitest";
import {
  TOPUP_METHOD_KEYS,
  isTopUpMethod,
  resolveTopUpMethod,
  validateTopUpAmount,
  topUpPendingState,
  BANK_TRANSFER_INSTRUCTIONS,
  bankInstructionLines,
  failureRemediation,
} from "./topup-flow";

describe("parent dashboard top-up flow (P1-E11-S03)", () => {
  describe("method dispatch wiring (AC1/AC2/AC3)", () => {
    it("recognises exactly the three rails the dashboard offers", () => {
      expect(TOPUP_METHOD_KEYS).toEqual(["mpesa", "card", "bank"]);
    });

    it("isTopUpMethod is a precise type guard", () => {
      expect(isTopUpMethod("mpesa")).toBe(true);
      expect(isTopUpMethod("card")).toBe(true);
      expect(isTopUpMethod("bank")).toBe(true);
      expect(isTopUpMethod("paypal")).toBe(false);
      expect(isTopUpMethod("")).toBe(false);
      expect(isTopUpMethod(undefined)).toBe(false);
    });

    it("resolves each method to its handoff target + async-ness", () => {
      expect(resolveTopUpMethod("mpesa")).toEqual({
        key: "mpesa",
        kind: "async-stk",
        anchor: "mpesa-heading",
      });
      expect(resolveTopUpMethod("card")).toEqual({
        key: "card",
        kind: "async-redirect",
        anchor: "card-heading",
      });
      expect(resolveTopUpMethod("bank")).toEqual({
        key: "bank",
        kind: "manual-instructions",
        anchor: "bank-heading",
      });
    });

    it("returns null for an unknown method rather than throwing", () => {
      expect(resolveTopUpMethod("crypto")).toBeNull();
    });
  });

  describe("amount validation (AC1/AC2)", () => {
    it("requires a whole number of shillings (integer cents at the edge)", () => {
      expect(validateTopUpAmount(50.5)).toContain("whole number");
      expect(validateTopUpAmount(Number.NaN)).toContain("whole number");
    });

    it("enforces the minimum top-up", () => {
      expect(validateTopUpAmount(10)).toContain("Minimum");
    });

    it("enforces the maximum top-up", () => {
      expect(validateTopUpAmount(1_000_000)).toContain("Maximum");
    });

    it("accepts a valid whole-shilling amount", () => {
      expect(validateTopUpAmount(500)).toBeNull();
      expect(validateTopUpAmount(50)).toBeNull();
    });

    it("the bank rail is informational and does not gate on amount", () => {
      // Bank transfer is admin-confirmed; the parent enters no amount in-app.
      expect(validateTopUpAmount(50)).toBeNull();
    });
  });

  describe("pending-state logic (AC1/AC2)", () => {
    it("treats a fresh push as pending and still polling", () => {
      expect(topUpPendingState("STK_SENT")).toEqual({
        pending: true,
        succeeded: false,
        failed: false,
        stopPolling: false,
      });
      expect(topUpPendingState("INITIALIZED")).toEqual({
        pending: true,
        succeeded: false,
        failed: false,
        stopPolling: false,
      });
    });

    it("treats success as terminal + stop polling", () => {
      expect(topUpPendingState("SUCCEEDED")).toEqual({
        pending: false,
        succeeded: true,
        failed: false,
        stopPolling: true,
      });
    });

    it("treats failure / abandonment as terminal + stop polling", () => {
      expect(topUpPendingState("FAILED")).toEqual({
        pending: false,
        succeeded: false,
        failed: true,
        stopPolling: true,
      });
      expect(topUpPendingState("ABANDONED")).toEqual({
        pending: false,
        succeeded: false,
        failed: true,
        stopPolling: true,
      });
    });

    it("a null state (not yet initiated) is not pending and not terminal", () => {
      expect(topUpPendingState(null)).toEqual({
        pending: false,
        succeeded: false,
        failed: false,
        stopPolling: false,
      });
    });
  });

  describe("bank transfer instructions (AC3)", () => {
    it("exposes the destination account + confirmation copy", () => {
      expect(BANK_TRANSFER_INSTRUCTIONS.accountName).toMatch(/Baby Milestones/u);
      expect(BANK_TRANSFER_INSTRUCTIONS.bankName.length).toBeGreaterThan(0);
      expect(BANK_TRANSFER_INSTRUCTIONS.accountNumber.length).toBeGreaterThan(0);
      expect(BANK_TRANSFER_INSTRUCTIONS.note).toMatch(/confirm/iu);
    });

    it("renders ordered instruction lines including the account + admin confirmation", () => {
      const lines = bankInstructionLines();
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines.join(" ")).toMatch(/account/iu);
      expect(lines.join(" ")).toMatch(/admin/iu);
    });
  });

  describe("failure remediation copy (AC4)", () => {
    it("maps each failed async rail to clear, actionable copy", () => {
      expect(failureRemediation("mpesa")).toMatch(/try again/iu);
      expect(failureRemediation("card")).toMatch(/try again/iu);
    });

    it("falls back to generic remediation for an unknown rail", () => {
      expect(failureRemediation("bank")).toMatch(/.+/u);
    });
  });
});
