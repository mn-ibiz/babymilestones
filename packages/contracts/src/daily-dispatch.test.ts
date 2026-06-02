import { describe, expect, it } from "vitest";
import {
  dailyDispatchQuerySchema,
  resolveDispatchDate,
  DAILY_DISPATCH_EXPORT_COLUMNS,
  dailyDispatchToCsv,
  dailyDispatchViewModel,
  dailyDispatchExportUrl,
  dailyDispatchFilename,
  DISPATCH_DEAD_LETTER_HREF,
  type DailyDispatchReportDto,
} from "./index.js";

/**
 * P4-E04-S04 (Story 29.4) — daily dispatch report contracts: the date query schema
 * (defaults to today — AC4), the CSV serialiser (header + status-count rows + a
 * totals/value row + the averages + the sync-health row, RFC-4180 escaped — AC3),
 * and the table view-model + the dead-letter link (AC5).
 */

function dto(over: Partial<DailyDispatchReportDto> = {}): DailyDispatchReportDto {
  return {
    date: "2026-06-02",
    countsByStatus: [
      { status: "new", count: 2 },
      { status: "packing", count: 1 },
      { status: "ready", count: 0 },
      { status: "dispatched", count: 3 },
      { status: "fulfilled", count: 4 },
      { status: "cancelled", count: 1 },
    ],
    totalOrders: 11,
    totalValueCents: 1_234_56,
    avgPackSeconds: 900,
    avgDispatchSeconds: 1200,
    syncHealthCount: 2,
    ...over,
  };
}

describe("dailyDispatchQuerySchema + resolveDispatchDate (Story 29.4 AC4)", () => {
  it("accepts a valid date", () => {
    expect(dailyDispatchQuerySchema.safeParse({ date: "2026-06-02" }).success).toBe(true);
  });

  it("accepts an absent date (defaults applied downstream)", () => {
    expect(dailyDispatchQuerySchema.safeParse({}).success).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(dailyDispatchQuerySchema.safeParse({ date: "02-06-2026" }).success).toBe(false);
  });

  it("defaults to today when the date is absent (AC4)", () => {
    const today = new Date("2026-06-02T15:00:00Z");
    expect(resolveDispatchDate(undefined, today)).toBe("2026-06-02");
    expect(resolveDispatchDate("2026-05-30", today)).toBe("2026-05-30");
  });
});

describe("dailyDispatchToCsv (Story 29.4 AC3)", () => {
  it("emits a header, one row per status, then totals / value / averages / sync-health rows", () => {
    const csv = dailyDispatchToCsv(dto());
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(DAILY_DISPATCH_EXPORT_COLUMNS.join(","));
    expect(lines[0]).toBe("metric,value");
    expect(lines).toContain("New,2");
    expect(lines).toContain("Packing,1");
    expect(lines).toContain("Ready,0");
    expect(lines).toContain("Dispatched,3");
    expect(lines).toContain("Fulfilled,4");
    expect(lines).toContain("Cancelled,1");
    expect(lines).toContain("Total orders,11");
    expect(lines).toContain("Total value (KES),1234.56");
    expect(lines).toContain("Average pack time (min),15.0");
    expect(lines).toContain("Average dispatch time (min),20.0");
    expect(lines).toContain("Sync health: stuck writebacks,2");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("renders null averages as n/a and a zero-data day cleanly", () => {
    const csv = dailyDispatchToCsv(
      dto({
        countsByStatus: [
          { status: "new", count: 0 },
          { status: "packing", count: 0 },
          { status: "ready", count: 0 },
          { status: "dispatched", count: 0 },
          { status: "fulfilled", count: 0 },
          { status: "cancelled", count: 0 },
        ],
        totalOrders: 0,
        totalValueCents: 0,
        avgPackSeconds: null,
        avgDispatchSeconds: null,
        syncHealthCount: 0,
      }),
    );
    const lines = csv.split("\r\n");
    expect(lines).toContain("Total value (KES),0.00");
    expect(lines).toContain("Average pack time (min),n/a");
    expect(lines).toContain("Average dispatch time (min),n/a");
    expect(lines).toContain("Sync health: stuck writebacks,0");
  });
});

describe("dailyDispatchViewModel (Story 29.4 AC2/AC5)", () => {
  it("builds a status-count table, formatted total value + averages and the dead-letter link", () => {
    const vm = dailyDispatchViewModel(dto());
    expect(vm.date).toBe("2026-06-02");
    const dispatched = vm.rows.find((r) => r.status === "dispatched")!;
    expect(dispatched.label).toBe("Dispatched");
    expect(dispatched.count).toBe(3);
    expect(vm.totalOrders).toBe(11);
    expect(vm.totalValue).toBe("KES 1234.56");
    expect(vm.avgPack).toBe("15.0 min");
    expect(vm.avgDispatch).toBe("20.0 min");
    expect(vm.syncHealth.count).toBe(2);
    expect(vm.syncHealth.href).toBe(DISPATCH_DEAD_LETTER_HREF);
    expect(vm.syncHealth.href).toBe("/woocommerce-sync");
  });

  it("formats null averages as n/a", () => {
    const vm = dailyDispatchViewModel(dto({ avgPackSeconds: null, avgDispatchSeconds: null }));
    expect(vm.avgPack).toBe("n/a");
    expect(vm.avgDispatch).toBe("n/a");
  });
});

describe("dispatch export url + filename (Story 29.4 AC3/AC4)", () => {
  it("carries the date on the export URL", () => {
    const url = dailyDispatchExportUrl({ date: "2026-06-02" });
    expect(url).toContain("/admin/daily-dispatch/export");
    expect(url).toContain("date=2026-06-02");
  });

  it("names the download for the date", () => {
    expect(dailyDispatchFilename({ date: "2026-06-02" })).toBe("daily_dispatch_2026-06-02.csv");
  });
});
