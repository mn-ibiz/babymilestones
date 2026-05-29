import { describe, it, expect } from "vitest";
import {
  formatKes,
  formatPoints,
  sourceLabel,
  toLoyaltyHistoryView,
} from "./loyalty";

describe("formatKes", () => {
  it("formats integer cents as KES with 2 decimals", () => {
    expect(formatKes(123456)).toBe("KES 1,234.56");
    expect(formatKes(0)).toBe("KES 0.00");
    expect(formatKes(10000)).toBe("KES 100.00");
  });
});

describe("formatPoints", () => {
  it("pluralizes and groups thousands", () => {
    expect(formatPoints(1)).toBe("1 pt");
    expect(formatPoints(0)).toBe("0 pts");
    expect(formatPoints(1250)).toBe("1,250 pts");
  });
});

describe("sourceLabel", () => {
  it("maps known sources to friendly labels (AC2)", () => {
    expect(sourceLabel("topup")).toBe("Top-up");
    expect(sourceLabel("booking")).toBe("Booking");
    expect(sourceLabel("parent_checkout")).toBe("Redeemed at checkout");
    expect(sourceLabel("mystery")).toBe("mystery");
  });
});

describe("toLoyaltyHistoryView", () => {
  it("shapes an earn row with a + sign", () => {
    const view = toLoyaltyHistoryView({
      id: "l1",
      direction: "earn",
      points: 10,
      sourceType: "topup",
      sourceId: "t1",
      date: "2026-05-20T10:00:00.000Z",
    });
    expect(view.label).toBe("Top-up");
    expect(view.points).toBe("+10 pts");
    expect(view.direction).toBe("earn");
  });

  it("shapes a redeem row with a - sign", () => {
    const view = toLoyaltyHistoryView({
      id: "l2",
      direction: "redeem",
      points: 40,
      sourceType: "parent_checkout",
      sourceId: null,
      date: "2026-05-21T10:00:00.000Z",
    });
    expect(view.label).toBe("Redeemed at checkout");
    expect(view.points).toBe("-40 pts");
    expect(view.direction).toBe("redeem");
  });
});
