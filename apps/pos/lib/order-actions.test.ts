import { describe, expect, it } from "vitest";
import { enabledOrderActions, orderActionStates } from "./order-actions";

/**
 * Story 29.2 (P4-E04-S02) — pure action-sheet enablement helpers. Validates that
 * the five actions (AC1) are present always but enabled only when legal from the
 * current status (AC4), reversals gated by the admin flag (AC4), and dispatch
 * flagged for the rider/courier capture (AC5).
 */
describe("orderActionStates (Story 29.2)", () => {
  it("always lists all five actions in order (AC1)", () => {
    const states = orderActionStates("new");
    expect(states.map((s) => s.action)).toEqual([
      "start_packing",
      "mark_ready",
      "mark_dispatched",
      "mark_fulfilled",
      "cancel",
    ]);
  });

  it("from new: only Start packing + Cancel are enabled (AC4)", () => {
    const states = orderActionStates("new");
    const enabled = states.filter((s) => s.enabled).map((s) => s.action);
    expect(enabled).toEqual(["start_packing", "cancel"]);
  });

  it("from packing: only Mark ready + Cancel are enabled (no skip to dispatched) (AC4)", () => {
    const enabled = enabledOrderActions("packing").map((s) => s.action);
    expect(enabled).toEqual(["mark_ready", "cancel"]);
  });

  it("from ready: only Mark dispatched + Cancel are enabled for a non-admin (AC4)", () => {
    const enabled = enabledOrderActions("ready").map((s) => s.action);
    expect(enabled).toEqual(["mark_dispatched", "cancel"]);
  });

  it("from dispatched: only Mark fulfilled + Cancel are enabled (AC4)", () => {
    const enabled = enabledOrderActions("dispatched").map((s) => s.action);
    expect(enabled).toEqual(["mark_fulfilled", "cancel"]);
  });

  it("from fulfilled (terminal): nothing enabled for a non-admin (AC4)", () => {
    expect(enabledOrderActions("fulfilled")).toHaveLength(0);
  });

  it("from cancelled (terminal): nothing enabled even for an admin (AC4)", () => {
    expect(enabledOrderActions("cancelled", { canReverse: true })).toHaveLength(0);
  });

  it("admin can reverse: from ready, Start packing becomes enabled as a reversal (AC4)", () => {
    const states = orderActionStates("ready", { canReverse: true });
    const startPacking = states.find((s) => s.action === "start_packing")!;
    expect(startPacking.enabled).toBe(true);
    expect(startPacking.reversal).toBe(true);
  });

  it("non-admin sees the reversal action present but DISABLED (AC4)", () => {
    const states = orderActionStates("ready", { canReverse: false });
    const startPacking = states.find((s) => s.action === "start_packing")!;
    expect(startPacking.enabled).toBe(false);
    expect(startPacking.reversal).toBe(true);
  });

  it("flags mark_dispatched as requiring rider/courier detail (AC5)", () => {
    const dispatched = orderActionStates("ready").find((s) => s.action === "mark_dispatched")!;
    expect(dispatched.requiresDispatch).toBe(true);
  });
});
