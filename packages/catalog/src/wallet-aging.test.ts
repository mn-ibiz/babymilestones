import { describe, expect, it } from "vitest";
import {
  aggregateWalletAging,
  WALLET_AGING_BUCKETS,
  type AgingInvoiceRow,
} from "./wallet-aging.js";

/**
 * P3-E05-S04 (Story 27.4) — wallet aging-report aggregation tests.
 *
 * Pure, no I/O. The aggregation buckets every OUTSTANDING invoice by the AGE of
 * the amount (days from the invoice `createdAt` to `asOf`) into 0–7 / 8–30 /
 * 31–60 / 61–90 / 90+ (AC1), then rolls each parent up into a per-parent row
 * UNDER each bucket (AC2). Bucketing is PER-INVOICE: a parent with invoices of
 * different ages appears under more than one bucket. Zero-outstanding invoices
 * never appear.
 */
describe("aggregateWalletAging — buckets (AC1)", () => {
  const asOf = new Date("2026-06-02T00:00:00.000Z");
  // Helper: an invoice created `ageDays` before asOf, owed by `parentId`.
  const inv = (ageDays: number, amountDueCents: number, parentId = "p1", userId = "u1", parentName = "Pat Doe"): AgingInvoiceRow => ({
    invoiceId: `inv-${parentId}-${ageDays}-${amountDueCents}`,
    parentId,
    userId,
    parentName,
    amountDueCents,
    createdAt: new Date(asOf.getTime() - ageDays * 86_400_000),
  });

  it("exposes the five buckets in order with inclusive day ranges (AC1)", () => {
    expect(WALLET_AGING_BUCKETS.map((b) => b.key)).toEqual([
      "d0_7",
      "d8_30",
      "d31_60",
      "d61_90",
      "d90_plus",
    ]);
    expect(WALLET_AGING_BUCKETS.map((b) => [b.minDays, b.maxDays])).toEqual([
      [0, 7],
      [8, 30],
      [31, 60],
      [61, 90],
      [91, null],
    ]);
  });

  it("places boundary ages 7/8/30/31/60/61/90/91 in the right bucket (AC1)", () => {
    const report = aggregateWalletAging({
      asOf,
      invoices: [
        inv(0, 100, "a", "ua", "A"),
        inv(7, 100, "b", "ub", "B"),
        inv(8, 100, "c", "uc", "C"),
        inv(30, 100, "d", "ud", "D"),
        inv(31, 100, "e", "ue", "E"),
        inv(60, 100, "f", "uf", "F"),
        inv(61, 100, "g", "ug", "G"),
        inv(90, 100, "h", "uh", "H"),
        inv(91, 100, "i", "ui", "I"),
        inv(365, 100, "j", "uj", "J"),
      ],
    });
    const byKey = Object.fromEntries(report.buckets.map((b) => [b.key, b]));
    // 0 and 7 → 0–7
    expect(byKey.d0_7!.rows.map((r) => r.parentId).sort()).toEqual(["a", "b"]);
    // 8 and 30 → 8–30
    expect(byKey.d8_30!.rows.map((r) => r.parentId).sort()).toEqual(["c", "d"]);
    // 31 and 60 → 31–60
    expect(byKey.d31_60!.rows.map((r) => r.parentId).sort()).toEqual(["e", "f"]);
    // 61 and 90 → 61–90
    expect(byKey.d61_90!.rows.map((r) => r.parentId).sort()).toEqual(["g", "h"]);
    // 91 and 365 → 90+
    expect(byKey.d90_plus!.rows.map((r) => r.parentId).sort()).toEqual(["i", "j"]);
  });

  it("buckets PER-INVOICE: one parent with two ages appears under two buckets (AC2)", () => {
    const report = aggregateWalletAging({
      asOf,
      invoices: [
        inv(3, 1000, "p1", "u1", "Pat Doe"), // 0–7
        inv(45, 2000, "p1", "u1", "Pat Doe"), // 31–60
      ],
    });
    const byKey = Object.fromEntries(report.buckets.map((b) => [b.key, b]));
    expect(byKey.d0_7!.rows).toHaveLength(1);
    expect(byKey.d0_7!.rows[0]).toMatchObject({ parentId: "p1", amountCents: 1000 });
    expect(byKey.d31_60!.rows).toHaveLength(1);
    expect(byKey.d31_60!.rows[0]).toMatchObject({ parentId: "p1", amountCents: 2000 });
    expect(byKey.d8_30!.rows).toHaveLength(0);
  });

  it("sums a parent's invoices WITHIN the same bucket into one row (AC2)", () => {
    const report = aggregateWalletAging({
      asOf,
      invoices: [
        inv(2, 1000, "p1", "u1", "Pat Doe"),
        inv(5, 500, "p1", "u1", "Pat Doe"),
      ],
    });
    const bucket = report.buckets.find((b) => b.key === "d0_7")!;
    expect(bucket.rows).toHaveLength(1);
    expect(bucket.rows[0]).toMatchObject({ parentId: "p1", amountCents: 1500 });
    expect(bucket.totalCents).toBe(1500);
  });

  it("excludes zero / negative outstanding invoices (AC2)", () => {
    const report = aggregateWalletAging({
      asOf,
      invoices: [inv(3, 0, "p1"), inv(3, -100, "p2")],
    });
    for (const b of report.buckets) expect(b.rows).toHaveLength(0);
    expect(report.totalCents).toBe(0);
  });

  it("ranks per-bucket rows by amount desc, then parent name, then id", () => {
    const report = aggregateWalletAging({
      asOf,
      invoices: [
        inv(1, 500, "p1", "u1", "Bea"),
        inv(1, 900, "p2", "u2", "Zoe"),
        inv(1, 500, "p3", "u3", "Ann"),
      ],
    });
    const bucket = report.buckets.find((b) => b.key === "d0_7")!;
    expect(bucket.rows.map((r) => r.parentId)).toEqual(["p2", "p3", "p1"]);
  });

  it("carries each parent's profile link target (userId) on the row (AC2)", () => {
    const report = aggregateWalletAging({
      asOf,
      invoices: [inv(3, 1000, "p1", "u-99", "Pat Doe")],
    });
    const row = report.buckets.find((b) => b.key === "d0_7")!.rows[0]!;
    expect(row.userId).toBe("u-99");
    expect(row.parentName).toBe("Pat Doe");
  });

  it("totals per bucket and a grand total across all buckets", () => {
    const report = aggregateWalletAging({
      asOf,
      invoices: [inv(3, 1000), inv(45, 2000, "p2", "u2", "Q")],
    });
    const byKey = Object.fromEntries(report.buckets.map((b) => [b.key, b]));
    expect(byKey.d0_7!.totalCents).toBe(1000);
    expect(byKey.d31_60!.totalCents).toBe(2000);
    expect(report.totalCents).toBe(3000);
  });

  it("always returns all five buckets even when empty (stable surface)", () => {
    const report = aggregateWalletAging({ asOf, invoices: [] });
    expect(report.buckets).toHaveLength(5);
    for (const b of report.buckets) {
      expect(b.rows).toEqual([]);
      expect(b.totalCents).toBe(0);
    }
  });
});
