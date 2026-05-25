import { describe, expect, it } from "vitest";
import { centsToDisplay, displayToCents, formatKes } from "./money.js";

describe("centsToDisplay", () => {
  it("formats whole and fractional cents with two decimals", () => {
    expect(centsToDisplay(50000)).toBe("500.00");
    expect(centsToDisplay(50)).toBe("0.50");
    expect(centsToDisplay(5)).toBe("0.05");
    expect(centsToDisplay(0)).toBe("0.00");
    expect(centsToDisplay(123456)).toBe("1234.56");
  });

  it("handles negatives", () => {
    expect(centsToDisplay(-50000)).toBe("-500.00");
    expect(centsToDisplay(-5)).toBe("-0.05");
  });
});

describe("displayToCents", () => {
  it("parses decimal strings to integer cents (no float)", () => {
    expect(displayToCents("500")).toBe(50000);
    expect(displayToCents("500.00")).toBe(50000);
    expect(displayToCents("0.50")).toBe(50);
    expect(displayToCents("0.05")).toBe(5);
    expect(displayToCents("1234.56")).toBe(123456);
  });

  it("truncates beyond two decimal places", () => {
    expect(displayToCents("1.999")).toBe(199);
  });

  it("strips currency symbols and separators", () => {
    expect(displayToCents("KES 1,234.56")).toBe(123456);
  });

  it("returns null when there are no digits", () => {
    expect(displayToCents("")).toBeNull();
    expect(displayToCents("KES")).toBeNull();
  });

  it("round-trips with centsToDisplay", () => {
    for (const cents of [0, 5, 50, 50000, 123456]) {
      expect(displayToCents(centsToDisplay(cents))).toBe(cents);
    }
  });
});

describe("formatKes", () => {
  it("prefixes the KES label", () => {
    expect(formatKes(50000)).toBe("KES 500.00");
  });
});
