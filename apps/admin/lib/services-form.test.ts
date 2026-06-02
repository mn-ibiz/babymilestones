import { describe, expect, it } from "vitest";
import {
  attributionRoleLabel,
  attributionRoleOptions,
  canManageServices,
  coachingFormatLabel,
  coachingFormatOptions,
  DEFAULT_TAX_TREATMENT,
  formatPriceKes,
  parseAgeStageTags,
  priceHistoryRows,
  serviceUnitOptions,
  taxTreatmentLabel,
  taxTreatmentOptions,
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

describe("attribution role form logic (P1-E07-S02)", () => {
  it("offers the constrained staff-role taxonomy (AC1)", () => {
    expect(attributionRoleOptions.map((o) => o.value)).toEqual([
      "stylist",
      "instructor",
      "attendant",
      "coach",
      "event_staff",
    ]);
    expect(attributionRoleLabel("event_staff")).toBe("Event staff");
    expect(attributionRoleLabel("stylist")).toBe("Stylist");
  });

  it("accepts an empty role (attribution optional, AC3)", () => {
    expect(validateServiceForm({ name: "Hall", unit: "event", attributionRoleRequired: "" })).toEqual({});
    expect(validateServiceForm({ name: "Hall", unit: "event" })).toEqual({});
  });

  it("accepts a valid attribution role (AC1)", () => {
    expect(
      validateServiceForm({ name: "Haircut", unit: "salon", attributionRoleRequired: "stylist" }),
    ).toEqual({});
  });

  it("rejects a role outside the taxonomy (AC1)", () => {
    expect(
      validateServiceForm({ name: "X", unit: "play", attributionRoleRequired: "reception" })
        .attributionRoleRequired,
    ).toBeDefined();
  });
});

describe("tax treatment form logic (P1-E07-S04)", () => {
  it("offers the four treatments with labels + a vat_exempt default (AC1/AC3)", () => {
    expect(taxTreatmentOptions.map((o) => o.value)).toEqual([
      "vat_inclusive",
      "vat_exclusive",
      "vat_exempt",
      "zero_rated",
    ]);
    expect(taxTreatmentLabel("vat_inclusive")).toBe("VAT inclusive");
    expect(taxTreatmentLabel("zero_rated")).toBe("Zero rated");
    expect(DEFAULT_TAX_TREATMENT).toBe("vat_exempt");
  });

  it("accepts an empty treatment (defaults server-side, AC3) + a valid one (AC1)", () => {
    expect(validateServiceForm({ name: "Play", unit: "play", taxTreatment: "" })).toEqual({});
    expect(
      validateServiceForm({ name: "Salon", unit: "salon", taxTreatment: "vat_exclusive" }),
    ).toEqual({});
  });

  it("rejects a treatment outside the enum (AC1)", () => {
    expect(
      validateServiceForm({ name: "X", unit: "play", taxTreatment: "gst" }).taxTreatment,
    ).toBeDefined();
  });
});

describe("coaching catalogue form logic (P5-E01-S01 / Story 31.1)", () => {
  it("offers the two formats with labels (AC2)", () => {
    expect(coachingFormatOptions.map((o) => o.value)).toEqual(["one_to_one", "group"]);
    expect(coachingFormatLabel("one_to_one")).toBe("One to one");
    expect(coachingFormatLabel("group")).toBe("Group");
  });

  it("accepts an empty/valid coaching format (AC2)", () => {
    expect(validateServiceForm({ name: "C", unit: "coaching", format: "" })).toEqual({});
    expect(validateServiceForm({ name: "C", unit: "coaching", format: "one_to_one" })).toEqual({});
    expect(validateServiceForm({ name: "C", unit: "coaching", format: "group" })).toEqual({});
  });

  it("rejects a format outside the enum (AC2)", () => {
    expect(validateServiceForm({ name: "C", unit: "coaching", format: "webinar" }).format).toBeDefined();
  });

  it("validates the coaching duration (positive integer minutes) (AC2)", () => {
    expect(validateServiceForm({ name: "C", unit: "coaching", coachingDurationMinutes: 45 })).toEqual({});
    expect(validateServiceForm({ name: "C", unit: "coaching", coachingDurationMinutes: 0 }).coachingDurationMinutes).toBeDefined();
    expect(validateServiceForm({ name: "C", unit: "coaching", coachingDurationMinutes: 1.5 }).coachingDurationMinutes).toBeDefined();
  });

  it("parses a comma/newline age-stage tag input — trims, dedupes, drops blanks (AC2)", () => {
    expect(parseAgeStageTags("expecting, 0-3mo, 3-6mo")).toEqual(["expecting", "0-3mo", "3-6mo"]);
    expect(parseAgeStageTags(" 0-3mo ,, 0-3mo \n 3-6mo")).toEqual(["0-3mo", "3-6mo"]);
    expect(parseAgeStageTags("")).toEqual([]);
    expect(parseAgeStageTags("   ")).toEqual([]);
  });

  it("validates the group coaching capacity (positive integer seats) (P5-E01-S03 AC1)", () => {
    expect(validateServiceForm({ name: "G", unit: "coaching", coachingCapacity: 8 })).toEqual({});
    expect(validateServiceForm({ name: "G", unit: "coaching", coachingCapacity: 1 })).toEqual({});
    expect(validateServiceForm({ name: "G", unit: "coaching", coachingCapacity: null })).toEqual({});
    expect(validateServiceForm({ name: "G", unit: "coaching", coachingCapacity: 0 }).coachingCapacity).toBeDefined();
    expect(validateServiceForm({ name: "G", unit: "coaching", coachingCapacity: -2 }).coachingCapacity).toBeDefined();
    expect(validateServiceForm({ name: "G", unit: "coaching", coachingCapacity: 2.5 }).coachingCapacity).toBeDefined();
  });

  it("flags a group format with capacity 1 (a group implies > 1 seat) (P5-E01-S03 AC1)", () => {
    expect(
      validateServiceForm({ name: "G", unit: "coaching", format: "group", coachingCapacity: 1 }).coachingCapacity,
    ).toBeDefined();
    // A group with > 1 is fine; one_to_one with 1 is fine.
    expect(validateServiceForm({ name: "G", unit: "coaching", format: "group", coachingCapacity: 4 })).toEqual({});
    expect(validateServiceForm({ name: "S", unit: "coaching", format: "one_to_one", coachingCapacity: 1 })).toEqual({});
  });
});

describe("discreet billing form logic (P5-E01-S05 / Story 31.5)", () => {
  it("requires a non-empty label when discreet billing is enabled (AC1/AC3)", () => {
    expect(
      validateServiceForm({
        name: "C",
        unit: "coaching",
        discreetBillingEnabled: true,
        discreetBillingLabel: "BM Coaching Session",
      }),
    ).toEqual({});
    expect(
      validateServiceForm({ name: "C", unit: "coaching", discreetBillingEnabled: true })
        .discreetBillingLabel,
    ).toBeDefined();
    expect(
      validateServiceForm({
        name: "C",
        unit: "coaching",
        discreetBillingEnabled: true,
        discreetBillingLabel: "   ",
      }).discreetBillingLabel,
    ).toBeDefined();
  });

  it("does not require a label when discreet billing is off (AC3)", () => {
    expect(validateServiceForm({ name: "C", unit: "coaching", discreetBillingEnabled: false })).toEqual({});
    expect(validateServiceForm({ name: "C", unit: "coaching" })).toEqual({});
    // A stray label without the toggle is harmless (ignored).
    expect(
      validateServiceForm({ name: "C", unit: "coaching", discreetBillingLabel: "BM Coaching Session" }),
    ).toEqual({});
  });
});
