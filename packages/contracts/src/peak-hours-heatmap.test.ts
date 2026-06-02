import { describe, expect, it } from "vitest";
import {
  peakHoursHeatmapQuerySchema,
  peakHoursRangeDayCount,
  PEAK_HOURS_MAX_DAYS,
  peakHoursHeatmapViewModel,
  HEATMAP_WEEKDAY_LABELS,
  type PeakHoursHeatmapDto,
} from "./index.js";

/**
 * P3-E05-S05 (Story 27.5) — peak-hours heatmap contracts: the date-range + unit
 * query schema (range capped at 12 months / 366 days, AC3; optional unit filter,
 * AC2) and the render-ready grid view-model (7×24 cells with intensity classes,
 * AC1). Weekday convention: 0=Sun … 6=Sat (UTC); hour 0–23 (UTC).
 */

function dto(over: Partial<PeakHoursHeatmapDto> = {}): PeakHoursHeatmapDto {
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  cells[3]![10] = 4;
  cells[4]![15] = 2;
  return {
    from: "2026-06-01",
    to: "2026-06-07",
    unit: null,
    cells,
    totalSessions: 6,
    peak: { weekday: 3, hour: 10, count: 4 },
    ...over,
  };
}

describe("peakHoursHeatmapQuerySchema (Story 27.5 AC2/AC3)", () => {
  it("accepts a valid inclusive range with no unit (all units)", () => {
    const r = peakHoursHeatmapQuerySchema.safeParse({ fromDate: "2026-06-01", toDate: "2026-06-07" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.unit).toBeUndefined();
  });

  it("accepts a single allowed unit filter (AC2)", () => {
    const r = peakHoursHeatmapQuerySchema.safeParse({
      fromDate: "2026-06-01",
      toDate: "2026-06-07",
      unit: "salon",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.unit).toBe("salon");
  });

  it("treats an empty-string unit as all units (no filter)", () => {
    const r = peakHoursHeatmapQuerySchema.safeParse({
      fromDate: "2026-06-01",
      toDate: "2026-06-07",
      unit: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.unit).toBeUndefined();
  });

  it("rejects an unknown unit (AC2)", () => {
    const r = peakHoursHeatmapQuerySchema.safeParse({
      fromDate: "2026-06-01",
      toDate: "2026-06-07",
      unit: "spaceship",
    });
    expect(r.success).toBe(false);
  });

  it("rejects fromDate after toDate", () => {
    expect(
      peakHoursHeatmapQuerySchema.safeParse({ fromDate: "2026-06-08", toDate: "2026-06-01" }).success,
    ).toBe(false);
  });

  it("accepts a range of exactly 12 months / 366 days (AC3)", () => {
    // 2025-06-02 .. 2026-06-02 inclusive = 366 days.
    expect(peakHoursRangeDayCount("2025-06-02", "2026-06-02")).toBe(PEAK_HOURS_MAX_DAYS);
    const r = peakHoursHeatmapQuerySchema.safeParse({ fromDate: "2025-06-02", toDate: "2026-06-02" });
    expect(r.success).toBe(true);
  });

  it("rejects a range longer than 12 months (AC3)", () => {
    // 367 inclusive days.
    const r = peakHoursHeatmapQuerySchema.safeParse({ fromDate: "2025-06-01", toDate: "2026-06-02" });
    expect(peakHoursRangeDayCount("2025-06-01", "2026-06-02")).toBe(367);
    expect(r.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(
      peakHoursHeatmapQuerySchema.safeParse({ fromDate: "01-06-2026", toDate: "2026-06-07" }).success,
    ).toBe(false);
  });
});

describe("peakHoursHeatmapViewModel (Story 27.5 AC1)", () => {
  it("builds a 7-row grid with one labelled row per weekday, 24 cells each", () => {
    const vm = peakHoursHeatmapViewModel(dto());
    expect(vm.from).toBe("2026-06-01");
    expect(vm.to).toBe("2026-06-07");
    expect(vm.rows).toHaveLength(7);
    expect(vm.rows.map((r) => r.label)).toEqual(HEATMAP_WEEKDAY_LABELS);
    for (const row of vm.rows) {
      expect(row.cells).toHaveLength(24);
    }
  });

  it("carries the raw count + an intensity bucket per cell (AC1)", () => {
    const vm = peakHoursHeatmapViewModel(dto());
    const wed = vm.rows[3]!;
    const cell = wed.cells[10]!;
    expect(cell.hour).toBe(10);
    expect(cell.count).toBe(4);
    // Hottest cell → top intensity; empty cells → zero intensity.
    expect(cell.intensity).toBeGreaterThan(0);
    expect(wed.cells[0]!.count).toBe(0);
    expect(wed.cells[0]!.intensity).toBe(0);
  });

  it("surfaces the peak label + total sessions (AC1)", () => {
    const vm = peakHoursHeatmapViewModel(dto());
    expect(vm.totalSessions).toBe(6);
    expect(vm.peakLabel).toContain("Wed");
    expect(vm.peakLabel).toContain("10:00");
  });

  it("reports no peak for an all-empty grid", () => {
    const empty = dto({
      cells: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
      totalSessions: 0,
      peak: null,
    });
    const vm = peakHoursHeatmapViewModel(empty);
    expect(vm.totalSessions).toBe(0);
    expect(vm.peakLabel).toBeNull();
    expect(vm.rows.flatMap((r) => r.cells).every((c) => c.intensity === 0)).toBe(true);
  });
});
