import { describe, expect, it } from "vitest";
import {
  repeatAttendanceQuerySchema,
  repeatAttendanceViewModel,
  repeatAttendanceUrl,
  type RepeatAttendanceDto,
} from "./index.js";

/**
 * P6-E06-S03 (Story 35.3) — repeat-attendance contracts: the date-range query
 * schema (AC2 — both bounds real `YYYY-MM-DD`, `fromDate <= toDate`) and the
 * render-ready view-model (per-class rows with formatted percentages + the summary).
 */

function dto(over: Partial<RepeatAttendanceDto> = {}): RepeatAttendanceDto {
  return {
    from: "2026-06-01",
    to: "2026-06-30",
    classes: [
      {
        classId: "service:abc",
        label: "Music",
        totalAttendees: 4,
        repeatAttendees: 3,
        repeatAttendeePct: 75,
        avgClassesAttended: 1.8,
      },
    ],
    summary: {
      totalClasses: 2,
      totalAttendees: 5,
      repeatAttendees: 3,
      repeatAttendeePct: 60,
      avgClassesAttended: 1.6,
    },
    ...over,
  };
}

describe("repeatAttendanceQuerySchema (Story 35.3 AC2)", () => {
  it("accepts a valid in-order date range", () => {
    const r = repeatAttendanceQuerySchema.safeParse({ fromDate: "2026-06-01", toDate: "2026-06-30" });
    expect(r.success).toBe(true);
  });

  it("rejects an out-of-order range", () => {
    const r = repeatAttendanceQuerySchema.safeParse({ fromDate: "2026-06-30", toDate: "2026-06-01" });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    const r = repeatAttendanceQuerySchema.safeParse({ fromDate: "2026-6-1", toDate: "2026-06-30" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing bound", () => {
    expect(repeatAttendanceQuerySchema.safeParse({ fromDate: "2026-06-01" }).success).toBe(false);
  });
});

describe("repeatAttendanceViewModel (Story 35.3 AC1)", () => {
  it("formats per-class rows with a percent + a one-decimal average", () => {
    const vm = repeatAttendanceViewModel(dto());
    expect(vm.from).toBe("2026-06-01");
    expect(vm.to).toBe("2026-06-30");
    expect(vm.rows).toHaveLength(1);
    const row = vm.rows[0]!;
    expect(row.label).toBe("Music");
    expect(row.totalAttendees).toBe(4);
    expect(row.repeatAttendeePctLabel).toBe("75.0%");
    expect(row.avgClassesAttendedLabel).toBe("1.8");
  });

  it("formats the summary line (AC1)", () => {
    const vm = repeatAttendanceViewModel(dto());
    expect(vm.summary.totalClasses).toBe(2);
    expect(vm.summary.totalAttendees).toBe(5);
    expect(vm.summary.repeatAttendeePctLabel).toBe("60.0%");
    expect(vm.summary.avgClassesAttendedLabel).toBe("1.6");
  });

  it("renders an empty table when no classes fell in the window", () => {
    const vm = repeatAttendanceViewModel(
      dto({
        classes: [],
        summary: { totalClasses: 0, totalAttendees: 0, repeatAttendees: 0, repeatAttendeePct: 0, avgClassesAttended: 0 },
      }),
    );
    expect(vm.rows).toEqual([]);
    expect(vm.summary.repeatAttendeePctLabel).toBe("0.0%");
  });
});

describe("repeatAttendanceUrl (Story 35.3)", () => {
  it("carries the date range as query params", () => {
    expect(repeatAttendanceUrl({ fromDate: "2026-06-01", toDate: "2026-06-30" })).toBe(
      "/admin/repeat-attendance?fromDate=2026-06-01&toDate=2026-06-30",
    );
  });
});
