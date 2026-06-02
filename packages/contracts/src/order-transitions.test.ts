import { describe, expect, it } from "vitest";
import {
  ORDER_TRANSITION_ACTIONS,
  WC_LOCAL_TO_WOO_DEFAULT,
  classifyTransition,
  isTerminalLocalStatus,
  mapLocalToWoo,
  nextForwardStatus,
  planTransition,
  type OrderTransitionAction,
} from "./order-transitions.js";

/**
 * Story 29.2 (P4-E04-S02) — the PURE order-status transition state machine and
 * the local→Woo status mapping. No db, no Woo client here.
 */
describe("order transition state machine (Story 29.2)", () => {
  describe("the five POS actions (AC1)", () => {
    it("exposes exactly Start packing / Mark ready / Mark dispatched / Mark fulfilled / Cancel", () => {
      expect(ORDER_TRANSITION_ACTIONS.map((a) => a.action)).toEqual([
        "start_packing",
        "mark_ready",
        "mark_dispatched",
        "mark_fulfilled",
        "cancel",
      ]);
      const labels = Object.fromEntries(ORDER_TRANSITION_ACTIONS.map((a) => [a.action, a.label]));
      expect(labels).toEqual({
        start_packing: "Start packing",
        mark_ready: "Mark ready",
        mark_dispatched: "Mark dispatched",
        mark_fulfilled: "Mark fulfilled",
        cancel: "Cancel",
      });
    });

    it("maps each action to its target local status", () => {
      const targets = Object.fromEntries(ORDER_TRANSITION_ACTIONS.map((a) => [a.action, a.to]));
      expect(targets).toEqual({
        start_packing: "packing",
        mark_ready: "ready",
        mark_dispatched: "dispatched",
        mark_fulfilled: "fulfilled",
        cancel: "cancelled",
      });
    });
  });

  describe("forward order (AC4 — cannot skip)", () => {
    it("advances one step linearly new→packing→ready→dispatched→fulfilled", () => {
      expect(nextForwardStatus("new")).toBe("packing");
      expect(nextForwardStatus("packing")).toBe("ready");
      expect(nextForwardStatus("ready")).toBe("dispatched");
      expect(nextForwardStatus("dispatched")).toBe("fulfilled");
    });

    it("has no forward step past fulfilled or from cancelled (terminal)", () => {
      expect(nextForwardStatus("fulfilled")).toBeNull();
      expect(nextForwardStatus("cancelled")).toBeNull();
    });

    it("classifies a single forward step as forward", () => {
      expect(classifyTransition("new", "packing")).toBe("forward");
      expect(classifyTransition("ready", "dispatched")).toBe("forward");
    });

    it("classifies a SKIP (new→ready, packing→dispatched) as invalid", () => {
      expect(classifyTransition("new", "ready")).toBe("invalid");
      expect(classifyTransition("packing", "dispatched")).toBe("invalid");
      expect(classifyTransition("new", "fulfilled")).toBe("invalid");
    });
  });

  describe("cancel (AC4 — from any non-terminal)", () => {
    it("allows cancel from new/packing/ready/dispatched", () => {
      for (const from of ["new", "packing", "ready", "dispatched"] as const) {
        expect(classifyTransition(from, "cancelled")).toBe("cancel");
      }
    });

    it("rejects cancel from a terminal status (fulfilled / cancelled)", () => {
      expect(classifyTransition("fulfilled", "cancelled")).toBe("invalid");
      expect(classifyTransition("cancelled", "cancelled")).toBe("invalid");
    });

    it("treats fulfilled and cancelled as terminal", () => {
      expect(isTerminalLocalStatus("fulfilled")).toBe(true);
      expect(isTerminalLocalStatus("cancelled")).toBe(true);
      expect(isTerminalLocalStatus("new")).toBe(false);
      expect(isTerminalLocalStatus("dispatched")).toBe(false);
    });
  });

  describe("reversal (AC4 — earlier status, admin only)", () => {
    it("classifies going to an earlier status as a reversal", () => {
      expect(classifyTransition("ready", "packing")).toBe("reversal");
      expect(classifyTransition("dispatched", "new")).toBe("reversal");
      expect(classifyTransition("fulfilled", "dispatched")).toBe("reversal");
    });

    it("classifies a no-op (same status) as invalid", () => {
      expect(classifyTransition("packing", "packing")).toBe("invalid");
    });
  });

  describe("planTransition — the authorization + validity decision (AC4)", () => {
    it("accepts a forward step for a non-admin POS role (cashier)", () => {
      const plan = planTransition({ from: "new", to: "packing", role: "cashier" });
      expect(plan.ok).toBe(true);
      if (plan.ok) expect(plan.kind).toBe("forward");
    });

    it("accepts a cancel for a non-admin POS role", () => {
      const plan = planTransition({ from: "packing", to: "cancelled", role: "packer" });
      expect(plan.ok).toBe(true);
      if (plan.ok) expect(plan.kind).toBe("cancel");
    });

    it("rejects a skip for any role with reason 'invalid'", () => {
      const plan = planTransition({ from: "new", to: "ready", role: "super_admin" });
      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.reason).toBe("invalid");
    });

    it("rejects a reversal for a non-admin POS role with reason 'forbidden'", () => {
      const plan = planTransition({ from: "ready", to: "packing", role: "cashier" });
      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.reason).toBe("forbidden");
    });

    it("allows a reversal for an admin role", () => {
      const plan = planTransition({ from: "ready", to: "packing", role: "admin" });
      expect(plan.ok).toBe(true);
      if (plan.ok) expect(plan.kind).toBe("reversal");
    });

    it("allows a reversal for super_admin", () => {
      const plan = planTransition({ from: "fulfilled", to: "dispatched", role: "super_admin" });
      expect(plan.ok).toBe(true);
      if (plan.ok) expect(plan.kind).toBe("reversal");
    });
  });

  describe("local → Woo status mapping (AC3)", () => {
    it("uses the documented defaults", () => {
      expect(WC_LOCAL_TO_WOO_DEFAULT).toEqual({
        packing: "processing",
        ready: "processing",
        dispatched: "completed",
        fulfilled: "completed",
        cancelled: "cancelled",
      });
    });

    it("maps each transition-target status to its Woo status", () => {
      expect(mapLocalToWoo("packing").status).toBe("processing");
      expect(mapLocalToWoo("ready").status).toBe("processing");
      expect(mapLocalToWoo("dispatched").status).toBe("completed");
      expect(mapLocalToWoo("fulfilled").status).toBe("completed");
      expect(mapLocalToWoo("cancelled").status).toBe("cancelled");
    });

    it("attaches a note for ready (AC3 — note added)", () => {
      const m = mapLocalToWoo("ready");
      expect(m.status).toBe("processing");
      expect(m.note).toBeTruthy();
    });

    it("does not attach a default note for packing / fulfilled / cancelled", () => {
      expect(mapLocalToWoo("packing").note).toBeUndefined();
      expect(mapLocalToWoo("fulfilled").note).toBeUndefined();
      expect(mapLocalToWoo("cancelled").note).toBeUndefined();
    });

    it("respects a configurable override map", () => {
      const m = mapLocalToWoo("packing", { packing: "on-hold" });
      expect(m.status).toBe("on-hold");
    });

    it("builds the dispatched tracking note from rider/vehicle/time (AC5)", () => {
      const m = mapLocalToWoo("dispatched", undefined, {
        riderName: "John Mwangi",
        vehicle: "KDA 123A",
        contact: "+254712345678",
        dispatchedAt: "2026-06-02T08:30:00.000Z",
      });
      expect(m.status).toBe("completed");
      expect(m.note).toContain("John Mwangi");
      expect(m.note).toContain("KDA 123A");
      expect(m.note).toContain("+254712345678");
    });
  });

  it("rejects an unknown action label lookup gracefully", () => {
    const known = ORDER_TRANSITION_ACTIONS.find((a) => a.action === ("nope" as OrderTransitionAction));
    expect(known).toBeUndefined();
  });
});
