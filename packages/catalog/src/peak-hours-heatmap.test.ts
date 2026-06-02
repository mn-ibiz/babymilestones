import { describe, expect, it } from "vitest";
import {
  aggregatePeakHoursHeatmap,
  HEATMAP_WEEKDAYS,
  HEATMAP_HOURS,
  type PeakHoursHeatmapInput,
} from "./peak-hours-heatmap.js";

/**
 * P3-E05-S05 (Story 27.5) — peak-hours heatmap aggregation. The pure
 * {@link aggregatePeakHoursHeatmap} reducer buckets each active session (an
 * attendance check-in) by weekday (0=Sun … 6=Sat, UTC) × hour-of-day (0–23, UTC)
 * and returns a fully zero-filled 7×24 grid whose cell intensity = the count of
 * sessions falling in that weekday+hour over the range (AC1). The DB read does the
 * booking→service→unit join + the unit filter (AC2); this reducer is pure I/O-free.
 */

function input(over: Partial<PeakHoursHeatmapInput> = {}): PeakHoursHeatmapInput {
  return {
    from: "2026-06-01",
    to: "2026-06-07",
    sessions: [],
    ...over,
  };
}

describe("aggregatePeakHoursHeatmap (Story 27.5)", () => {
  it("returns a full 7×24 grid, zero-filled for an empty range (AC1)", () => {
    const out = aggregatePeakHoursHeatmap(input());
    expect(out.cells).toHaveLength(7);
    for (const row of out.cells) {
      expect(row).toHaveLength(24);
      expect(row.every((c) => c === 0)).toBe(true);
    }
    expect(out.totalSessions).toBe(0);
    expect(out.peak).toBeNull();
  });

  it("exposes the weekday + hour axes in canonical order", () => {
    expect(HEATMAP_WEEKDAYS).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(HEATMAP_HOURS).toHaveLength(24);
    expect(HEATMAP_HOURS[0]).toBe(0);
    expect(HEATMAP_HOURS[23]).toBe(23);
  });

  it("buckets a session into its UTC weekday × hour cell (AC1)", () => {
    // 2026-06-03 is a Wednesday (UTC weekday 3); 10:30 UTC → hour 10.
    const out = aggregatePeakHoursHeatmap(
      input({ sessions: [{ checkedInAt: "2026-06-03T10:30:00.000Z" }] }),
    );
    expect(out.cells[3]![10]).toBe(1);
    expect(out.totalSessions).toBe(1);
    // Nothing else lit.
    expect(out.cells.flat().reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("accumulates multiple sessions in the same weekday+hour cell (AC1)", () => {
    const out = aggregatePeakHoursHeatmap(
      input({
        sessions: [
          { checkedInAt: "2026-06-03T10:05:00.000Z" },
          { checkedInAt: "2026-06-03T10:55:00.000Z" },
          { checkedInAt: "2026-06-03T10:30:00.000Z" },
        ],
      }),
    );
    expect(out.cells[3]![10]).toBe(3);
    expect(out.totalSessions).toBe(3);
  });

  it("spreads sessions across different weekdays + hours (AC1)", () => {
    const out = aggregatePeakHoursHeatmap(
      input({
        sessions: [
          { checkedInAt: "2026-06-01T08:00:00.000Z" }, // Mon (1) 08
          { checkedInAt: "2026-06-02T09:15:00.000Z" }, // Tue (2) 09
          { checkedInAt: "2026-06-07T23:59:00.000Z" }, // Sun (0) 23
          { checkedInAt: "2026-06-06T00:01:00.000Z" }, // Sat (6) 00
        ],
      }),
    );
    expect(out.cells[1]![8]).toBe(1);
    expect(out.cells[2]![9]).toBe(1);
    expect(out.cells[0]![23]).toBe(1);
    expect(out.cells[6]![0]).toBe(1);
    expect(out.totalSessions).toBe(4);
  });

  it("reports the single hottest cell as the peak (AC1)", () => {
    const out = aggregatePeakHoursHeatmap(
      input({
        sessions: [
          { checkedInAt: "2026-06-03T10:00:00.000Z" },
          { checkedInAt: "2026-06-03T10:30:00.000Z" },
          { checkedInAt: "2026-06-04T15:00:00.000Z" },
        ],
      }),
    );
    expect(out.peak).toEqual({ weekday: 3, hour: 10, count: 2 });
  });

  it("echoes the from/to bounds on the result", () => {
    const out = aggregatePeakHoursHeatmap(input({ from: "2026-01-01", to: "2026-03-31" }));
    expect(out.from).toBe("2026-01-01");
    expect(out.to).toBe("2026-03-31");
  });
});
