import { describe, expect, it } from "vitest";
import {
  autoCreditToggleViewState,
  canToggleAutoCredit,
} from "./auto-credit-toggle.js";

/**
 * P1-E03-S07 — parent-header auto-credit toggle view logic (AC2). Only admin /
 * super_admin may flip; everyone else (reception, cashier, ...) gets a disabled,
 * read-only control. The server re-checks the permission authoritatively.
 */
describe("auto-credit toggle UI logic (P1-E03-S07)", () => {
  it("admin and super_admin may flip the toggle (AC2)", () => {
    expect(canToggleAutoCredit("admin")).toBe(true);
    expect(canToggleAutoCredit("super_admin")).toBe(true);
  });

  it("reception/cashier/other roles may NOT flip the toggle (AC2)", () => {
    expect(canToggleAutoCredit("reception")).toBe(false);
    expect(canToggleAutoCredit("cashier")).toBe(false);
    expect(canToggleAutoCredit("parent")).toBe(false);
    expect(canToggleAutoCredit("")).toBe(false);
  });

  it("renders an actionable control for admin", () => {
    const vs = autoCreditToggleViewState("admin", false);
    expect(vs).toMatchObject({ checked: false, actionable: true });
  });

  it("renders a disabled, read-only control for reception, reflecting the value", () => {
    const vs = autoCreditToggleViewState("reception", true);
    expect(vs.actionable).toBe(false);
    expect(vs.checked).toBe(true);
    expect(vs.hint).toMatch(/admin/iu);
  });
});
