import { describe, expect, it } from "vitest";
import {
  cohortRetentionQuerySchema,
  cohortRetentionViewModel,
  type CohortRetentionDto,
} from "./index.js";

/**
 * Story 35.2 — cohort-retention contracts. The query schema validates the inclusive
 * signup-MONTH range (`YYYY-MM`) the report covers, plus the optional `activeDefinition`
 * override (AC2). The view-model shapes the DTO into a triangular grid the admin page
 * renders: a header row of offsets, one row per cohort with a formatted percentage per
 * observable offset and blanks beyond. Pure + framework-free.
 */

function dto(over: Partial<CohortRetentionDto> = {}): CohortRetentionDto {
  return {
    fromMonth: "2026-01",
    toMonth: "2026-02",
    asOfMonth: "2026-03",
    maxOffset: 2,
    cohorts: [
      {
        signupMonth: "2026-01",
        cohortSize: 4,
        cells: [
          { offset: 0, retained: 4, percentage: 100 },
          { offset: 1, retained: 3, percentage: 75 },
          { offset: 2, retained: 1, percentage: 25 },
        ],
      },
      {
        signupMonth: "2026-02",
        cohortSize: 2,
        cells: [
          { offset: 0, retained: 2, percentage: 100 },
          { offset: 1, retained: 1, percentage: 50 },
        ],
      },
    ],
    ...over,
  };
}

describe("cohortRetentionQuerySchema (Story 35.2)", () => {
  it("accepts a valid month range", () => {
    const r = cohortRetentionQuerySchema.safeParse({ fromMonth: "2026-01", toMonth: "2026-03" });
    expect(r.success).toBe(true);
  });

  it("accepts an optional activeDefinition override (AC2)", () => {
    const r = cohortRetentionQuerySchema.safeParse({
      fromMonth: "2026-01",
      toMonth: "2026-03",
      activeDefinition: "wallet_debit",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.activeDefinition).toBe("wallet_debit");
  });

  it("rejects fromMonth after toMonth", () => {
    const r = cohortRetentionQuerySchema.safeParse({ fromMonth: "2026-03", toMonth: "2026-01" });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed month", () => {
    expect(cohortRetentionQuerySchema.safeParse({ fromMonth: "2026-13", toMonth: "2026-03" }).success).toBe(false);
    expect(cohortRetentionQuerySchema.safeParse({ fromMonth: "2026-1", toMonth: "2026-03" }).success).toBe(false);
    expect(cohortRetentionQuerySchema.safeParse({ fromMonth: "", toMonth: "2026-03" }).success).toBe(false);
  });

  it("rejects an unknown activeDefinition", () => {
    const r = cohortRetentionQuerySchema.safeParse({
      fromMonth: "2026-01",
      toMonth: "2026-03",
      activeDefinition: "nope",
    });
    expect(r.success).toBe(false);
  });
});

describe("cohortRetentionViewModel (Story 35.2)", () => {
  it("builds a header of offsets 0..maxOffset (AC1)", () => {
    const vm = cohortRetentionViewModel(dto());
    expect(vm.offsetHeaders).toEqual([0, 1, 2]);
  });

  it("emits one row per cohort with a formatted percentage per observable offset (AC1)", () => {
    const vm = cohortRetentionViewModel(dto());
    const jan = vm.rows[0]!;
    expect(jan.signupMonth).toBe("2026-01");
    expect(jan.cohortSize).toBe(4);
    expect(jan.cells.map((c) => c.value)).toEqual(["100.0%", "75.0%", "25.0%"]);
  });

  it("pads a shorter cohort with blank cells beyond its last observable offset (AC1)", () => {
    const vm = cohortRetentionViewModel(dto());
    const feb = vm.rows[1]!;
    // Feb cohort observed only offsets 0,1 — offset 2 is a blank (not 0%).
    expect(feb.cells).toHaveLength(3);
    expect(feb.cells[2]).toMatchObject({ value: "", present: false });
    expect(feb.cells[0]).toMatchObject({ value: "100.0%", present: true });
  });

  it("renders an empty matrix with just the offset-0 header when there are no cohorts", () => {
    const vm = cohortRetentionViewModel(dto({ cohorts: [], maxOffset: 0 }));
    expect(vm.rows).toEqual([]);
    expect(vm.offsetHeaders).toEqual([0]);
  });
});
