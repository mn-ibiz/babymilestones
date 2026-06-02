import { describe, expect, it } from "vitest";
import {
  aggregateFeedbackDashboard,
  feedbackUnitForSourceType,
  FEEDBACK_MIN_SAMPLE_SIZE,
  type FeedbackDashboardInput,
  type FeedbackResponseRow,
} from "./feedback-dashboard.js";

/**
 * P6-E04-S02 (Story 34.2) — pure feedback-dashboard aggregation. Given the
 * submitted feedback rows in a date window (each carrying its source-type, the
 * attributed staff, the 0–5 rating), derive:
 *  - per-unit { count, average, distribution[0..5] } (AC1),
 *  - per-staff { staffId, count, average } where the average is SUPPRESSED until
 *    the staff member has >= FEEDBACK_MIN_SAMPLE_SIZE responses (AC1 guardrail) —
 *    so one early one-star never surfaces as a "staff average".
 * Exhaustively unit-tested — no I/O.
 */

function row(over: Partial<FeedbackResponseRow> = {}): FeedbackResponseRow {
  return {
    id: over.id ?? "f1",
    sourceType: over.sourceType ?? "salon",
    staffId: over.staffId ?? null,
    staffName: over.staffName ?? null,
    rating: over.rating ?? 5,
  };
}

function input(over: Partial<FeedbackDashboardInput> = {}): FeedbackDashboardInput {
  return {
    from: over.from ?? "2026-06-01",
    to: over.to ?? "2026-06-30",
    responses: over.responses ?? [],
  };
}

describe("feedbackUnitForSourceType (Story 34.2 — source_type → unit)", () => {
  it("maps the known source types to a unit label", () => {
    expect(feedbackUnitForSourceType("salon")).toBe("salon");
    expect(feedbackUnitForSourceType("attendance")).toBe("play");
    expect(feedbackUnitForSourceType("coaching")).toBe("coaching");
    expect(feedbackUnitForSourceType("order")).toBe("order");
  });

  it("falls back to 'other' for an unknown source type", () => {
    expect(feedbackUnitForSourceType("mystery")).toBe("other");
  });
});

describe("aggregateFeedbackDashboard — units (Story 34.2 AC1)", () => {
  it("zero-data window: no unit or staff rows, echoes the window", () => {
    const d = aggregateFeedbackDashboard(input());
    expect(d.from).toBe("2026-06-01");
    expect(d.to).toBe("2026-06-30");
    expect(d.units).toEqual([]);
    expect(d.staff).toEqual([]);
    expect(d.totalResponses).toBe(0);
  });

  it("computes per-unit count + average + a 0..5 distribution (AC1)", () => {
    const d = aggregateFeedbackDashboard(
      input({
        responses: [
          row({ id: "a", sourceType: "salon", rating: 5 }),
          row({ id: "b", sourceType: "salon", rating: 3 }),
          row({ id: "c", sourceType: "salon", rating: 4 }),
        ],
      }),
    );
    const salon = d.units.find((u) => u.unit === "salon")!;
    expect(salon.count).toBe(3);
    expect(salon.average).toBeCloseTo(4, 5);
    // distribution is indexed 0..5; three ratings: one 3, one 4, one 5.
    expect(salon.distribution).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it("buckets distinct source types into distinct units (AC1)", () => {
    const d = aggregateFeedbackDashboard(
      input({
        responses: [
          row({ id: "a", sourceType: "salon", rating: 5 }),
          row({ id: "b", sourceType: "attendance", rating: 1 }),
          row({ id: "c", sourceType: "coaching", rating: 4 }),
        ],
      }),
    );
    expect(d.units.map((u) => u.unit).sort()).toEqual(["coaching", "play", "salon"]);
    expect(d.totalResponses).toBe(3);
  });

  it("the per-unit distribution sums to the unit's count (AC1)", () => {
    const d = aggregateFeedbackDashboard(
      input({
        responses: [
          row({ id: "a", sourceType: "salon", rating: 0 }),
          row({ id: "b", sourceType: "salon", rating: 0 }),
          row({ id: "c", sourceType: "salon", rating: 5 }),
        ],
      }),
    );
    const salon = d.units.find((u) => u.unit === "salon")!;
    expect(salon.distribution.reduce((a, b) => a + b, 0)).toBe(salon.count);
    expect(salon.distribution[0]).toBe(2);
    expect(salon.distribution[5]).toBe(1);
  });
});

describe("aggregateFeedbackDashboard — staff min-sample guardrail (Story 34.2 AC1)", () => {
  it("the min-sample-size constant is a sane, named threshold", () => {
    expect(FEEDBACK_MIN_SAMPLE_SIZE).toBe(5);
  });

  it("suppresses a staff average until the sample reaches the threshold (AC1)", () => {
    // 4 responses for s1 → below the threshold (5): count surfaced, average hidden.
    const d = aggregateFeedbackDashboard(
      input({
        responses: Array.from({ length: 4 }, (_, i) =>
          row({ id: `r${i}`, staffId: "s1", staffName: "Asha", rating: 1 }),
        ),
      }),
    );
    const s1 = d.staff.find((s) => s.staffId === "s1")!;
    expect(s1.count).toBe(4);
    expect(s1.enoughSamples).toBe(false);
    expect(s1.average).toBeNull();
  });

  it("surfaces the staff average once the sample reaches the threshold (AC1)", () => {
    // 5 responses for s1 → at the threshold: average surfaced.
    const d = aggregateFeedbackDashboard(
      input({
        responses: [
          row({ id: "r0", staffId: "s1", staffName: "Asha", rating: 5 }),
          row({ id: "r1", staffId: "s1", staffName: "Asha", rating: 5 }),
          row({ id: "r2", staffId: "s1", staffName: "Asha", rating: 5 }),
          row({ id: "r3", staffId: "s1", staffName: "Asha", rating: 4 }),
          row({ id: "r4", staffId: "s1", staffName: "Asha", rating: 1 }),
        ],
      }),
    );
    const s1 = d.staff.find((s) => s.staffId === "s1")!;
    expect(s1.count).toBe(5);
    expect(s1.enoughSamples).toBe(true);
    expect(s1.average).toBeCloseTo(4, 5); // (5+5+5+4+1)/5
  });

  it("excludes unattributed responses from the staff list but not the unit totals", () => {
    const d = aggregateFeedbackDashboard(
      input({
        responses: [
          row({ id: "a", sourceType: "order", staffId: null, rating: 2 }),
          row({ id: "b", sourceType: "salon", staffId: "s1", staffName: "Asha", rating: 4 }),
        ],
      }),
    );
    expect(d.totalResponses).toBe(2);
    expect(d.units.find((u) => u.unit === "order")!.count).toBe(1);
    expect(d.staff.map((s) => s.staffId)).toEqual(["s1"]);
  });

  it("orders staff by name then id, ties stable", () => {
    const d = aggregateFeedbackDashboard(
      input({
        responses: [
          row({ id: "a", staffId: "s2", staffName: "Bree", rating: 5 }),
          row({ id: "b", staffId: "s1", staffName: "Asha", rating: 5 }),
        ],
      }),
    );
    expect(d.staff.map((s) => s.staffName)).toEqual(["Asha", "Bree"]);
  });

  it("falls back to a stable label when a staff name is missing", () => {
    const d = aggregateFeedbackDashboard(
      input({ responses: [row({ id: "a", staffId: "s9", staffName: null, rating: 3 })] }),
    );
    const s9 = d.staff.find((s) => s.staffId === "s9")!;
    expect(s9.staffName.length).toBeGreaterThan(0);
  });
});
