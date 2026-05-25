import { describe, expect, it } from "vitest";
import {
  canManageServices,
  formatPriceKes,
  priceHistoryRows,
  serviceUnitOptions,
  unitLabel,
  validatePriceForm,
  validateServiceForm,
} from "./services-form.js";

/**
 * P1-E07-S01 — admin service-catalogue form/view logic. Only admin/super_admin
 * may manage; the create + price forms validate client-side; the price history
 * renders with the current (open) row flagged.
 */
describe("service catalogue form logic (P1-E07-S01)", () => {
  it("only admin/super_admin may manage services", () => {
    expect(canManageServices("admin")).toBe(true);
    expect(canManageServices("super_admin")).toBe(true);
    expect(canManageServices("reception")).toBe(false);
    expect(canManageServices("")).toBe(false);
  });

  it("formats cents to KES exactly (no float)", () => {
    expect(formatPriceKes(60_000)).toBe("600.00");
    expect(formatPriceKes(50_005)).toBe("500.05");
    expect(formatPriceKes(0)).toBe("0.00");
  });

  it("exposes all five unit options with labels", () => {
    expect(serviceUnitOptions.map((o) => o.value)).toEqual([
      "play",
      "talent",
      "salon",
      "coaching",
      "event",
    ]);
    expect(unitLabel("coaching")).toBe("Coaching");
  });

  it("validates the create form (name + unit required)", () => {
    expect(validateServiceForm({ name: "Play", unit: "play" })).toEqual({});
    expect(validateServiceForm({ name: "  ", unit: "play" }).name).toBeDefined();
    expect(validateServiceForm({ name: "Play", unit: "spa" }).unit).toBeDefined();
  });

  it("validates the price form (non-negative integer cents + valid date)", () => {
    expect(validatePriceForm({ amountCents: 50_000, effectiveFrom: "2026-01-01" })).toEqual({});
    expect(validatePriceForm({ amountCents: -1, effectiveFrom: "2026-01-01" }).amount).toBeDefined();
    expect(validatePriceForm({ amountCents: 1.5, effectiveFrom: "2026-01-01" }).amount).toBeDefined();
    expect(validatePriceForm({ amountCents: 100, effectiveFrom: "nope" }).effectiveFrom).toBeDefined();
  });

  it("renders price history with the open row flagged current (AC3/AC4)", () => {
    const rows = priceHistoryRows([
      { amountCents: 50_000, effectiveFrom: "2026-01-01", effectiveTo: "2026-06-01" },
      { amountCents: 60_000, effectiveFrom: "2026-06-01", effectiveTo: null },
    ]);
    expect(rows[0]).toMatchObject({ amountLabel: "500.00", effectiveTo: "2026-06-01", isCurrent: false });
    expect(rows[1]).toMatchObject({ amountLabel: "600.00", effectiveTo: "current", isCurrent: true });
  });
});
