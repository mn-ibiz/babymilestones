import { describe, expect, it } from "vitest";
import {
  aggregateFloatVsRevenue,
  type FloatVsRevenueDayInput,
  type FloatVsRevenueInput,
} from "./float-vs-revenue.js";

/**
 * P5-E05-S04 (Story 35.4) — wallet float vs revenue. The pure
 * {@link aggregateFloatVsRevenue} reducer turns a per-day series of already-
 * resolved figures — `{ walletLiabilityCents, segregatedBalanceCents,
 * revenueCents }` for each calendar day in `[from, to]` — into:
 *
 *  - AC1: today's snapshot — the customer-wallet-liability total, the segregated
 *    (float/bank) balance, the PRIOR-DAY delta (today's liability − yesterday's),
 *    and the revenue earned that day.
 *  - AC2: the full N-day series (90 days by default) for the float-vs-revenue
 *    chart, each point carrying its own prior-day liability delta.
 *
 * No I/O — exhaustively unit-tested. The DB read assembles the inputs.
 */

const DAY_MS = 86_400_000;

/** Build an N-day ascending input ending on `to`, each day from `valueFor`. */
function series(
  to: string,
  days: number,
  valueFor: (day: string, i: number) => Omit<FloatVsRevenueDayInput, "date">,
): FloatVsRevenueInput {
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  const fromMs = toMs - (days - 1) * DAY_MS;
  const rows: FloatVsRevenueDayInput[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(fromMs + i * DAY_MS).toISOString().slice(0, 10);
    rows.push({ date, ...valueFor(date, i) });
  }
  return {
    from: new Date(fromMs).toISOString().slice(0, 10),
    to,
    days: rows,
  };
}

describe("aggregateFloatVsRevenue (Story 35.4)", () => {
  it("snapshot carries liability, segregated balance + revenue for the last day (AC1)", () => {
    const out = aggregateFloatVsRevenue({
      from: "2026-06-01",
      to: "2026-06-02",
      days: [
        { date: "2026-06-01", walletLiabilityCents: 50_000, segregatedBalanceCents: 48_000, revenueCents: 1_000 },
        { date: "2026-06-02", walletLiabilityCents: 62_000, segregatedBalanceCents: 60_000, revenueCents: 3_500 },
      ],
    });
    expect(out.snapshot.date).toBe("2026-06-02");
    expect(out.snapshot.walletLiabilityCents).toBe(62_000);
    expect(out.snapshot.segregatedBalanceCents).toBe(60_000);
    expect(out.snapshot.revenueCents).toBe(3_500);
  });

  it("prior-day delta = today's liability − yesterday's (AC1)", () => {
    const out = aggregateFloatVsRevenue({
      from: "2026-06-01",
      to: "2026-06-02",
      days: [
        { date: "2026-06-01", walletLiabilityCents: 50_000, segregatedBalanceCents: 0, revenueCents: 0 },
        { date: "2026-06-02", walletLiabilityCents: 62_000, segregatedBalanceCents: 0, revenueCents: 0 },
      ],
    });
    // 62_000 − 50_000 = +12_000.
    expect(out.snapshot.priorDayDeltaCents).toBe(12_000);
  });

  it("prior-day delta can be negative when liability falls", () => {
    const out = aggregateFloatVsRevenue({
      from: "2026-06-01",
      to: "2026-06-02",
      days: [
        { date: "2026-06-01", walletLiabilityCents: 80_000, segregatedBalanceCents: 0, revenueCents: 0 },
        { date: "2026-06-02", walletLiabilityCents: 75_000, segregatedBalanceCents: 0, revenueCents: 0 },
      ],
    });
    expect(out.snapshot.priorDayDeltaCents).toBe(-5_000);
  });

  it("the first day's prior-day delta is the liability itself (no prior day)", () => {
    const out = aggregateFloatVsRevenue({
      from: "2026-06-01",
      to: "2026-06-01",
      days: [
        { date: "2026-06-01", walletLiabilityCents: 40_000, segregatedBalanceCents: 0, revenueCents: 0 },
      ],
    });
    // With no prior day the baseline is 0, so the delta is the whole liability.
    expect(out.snapshot.priorDayDeltaCents).toBe(40_000);
    expect(out.series).toHaveLength(1);
    expect(out.series[0]!.priorDayDeltaCents).toBe(40_000);
  });

  it("emits one series point per day, ascending, each with its own prior-day delta (AC2)", () => {
    const out = aggregateFloatVsRevenue({
      from: "2026-06-01",
      to: "2026-06-03",
      days: [
        { date: "2026-06-01", walletLiabilityCents: 10_000, segregatedBalanceCents: 9_000, revenueCents: 100 },
        { date: "2026-06-02", walletLiabilityCents: 15_000, segregatedBalanceCents: 14_000, revenueCents: 200 },
        { date: "2026-06-03", walletLiabilityCents: 12_000, segregatedBalanceCents: 11_000, revenueCents: 300 },
      ],
    });
    expect(out.series.map((p) => p.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(out.series.map((p) => p.walletLiabilityCents)).toEqual([10_000, 15_000, 12_000]);
    expect(out.series.map((p) => p.segregatedBalanceCents)).toEqual([9_000, 14_000, 11_000]);
    expect(out.series.map((p) => p.revenueCents)).toEqual([100, 200, 300]);
    expect(out.series.map((p) => p.priorDayDeltaCents)).toEqual([10_000, 5_000, -3_000]);
  });

  it("assembles a full 90-day series (AC2)", () => {
    const input = series("2026-06-02", 90, (_d, i) => ({
      walletLiabilityCents: 1_000 * (i + 1),
      segregatedBalanceCents: 900 * (i + 1),
      revenueCents: 10 * (i + 1),
    }));
    const out = aggregateFloatVsRevenue(input);
    expect(out.series).toHaveLength(90);
    expect(out.from).toBe("2026-03-05");
    expect(out.to).toBe("2026-06-02");
    // Last day: liability 90_000, prior day 89_000 → delta +1_000.
    expect(out.snapshot.date).toBe("2026-06-02");
    expect(out.snapshot.walletLiabilityCents).toBe(90_000);
    expect(out.snapshot.priorDayDeltaCents).toBe(1_000);
  });

  it("handles an empty window — zeroed snapshot, empty series", () => {
    const out = aggregateFloatVsRevenue({ from: "2026-06-01", to: "2026-06-02", days: [] });
    expect(out.series).toEqual([]);
    expect(out.snapshot).toMatchObject({
      date: "2026-06-02",
      walletLiabilityCents: 0,
      segregatedBalanceCents: 0,
      revenueCents: 0,
      priorDayDeltaCents: 0,
    });
  });

  it("does not mutate its input", () => {
    const input: FloatVsRevenueInput = {
      from: "2026-06-01",
      to: "2026-06-01",
      days: [{ date: "2026-06-01", walletLiabilityCents: 5, segregatedBalanceCents: 4, revenueCents: 1 }],
    };
    const snapshot = JSON.stringify(input);
    aggregateFloatVsRevenue(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
