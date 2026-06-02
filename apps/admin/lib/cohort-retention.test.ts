import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCohortRetention,
  cohortGrid,
  defaultCohortRange,
  isValidCohortRange,
  type CohortRetention,
} from "./cohort-retention";

/**
 * Story 35.2 — admin cohort-retention client logic. Framework-free so it unit-tests
 * without React: the read seam over the admin-gated `/admin/cohort-retention` API
 * (month-range filter, credentialed), the triangular-grid view-model (re-exported
 * from `@bm/contracts`), and the month-range helpers.
 */

function report(over: Partial<CohortRetention> = {}): CohortRetention {
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

describe("fetchCohortRetention (Story 35.2)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the report from the admin endpoint with the month-range filter (credentialed)", async () => {
    const dto = report();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(dto), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchCohortRetention({ fromMonth: "2026-01", toMonth: "2026-02" });
    expect(out).toEqual(dto);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/cohort-retention?");
    expect(String(url)).toContain("fromMonth=2026-01");
    expect(String(url)).toContain("toMonth=2026-02");
    expect(init?.credentials).toBe("include");
  });

  it("surfaces a 403 (forbidden) as the server error (RBAC)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Forbidden: missing permission" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(fetchCohortRetention({ fromMonth: "2026-01", toMonth: "2026-02" })).rejects.toThrow(/forbidden/i);
  });
});

describe("cohort grid view-model (AC1)", () => {
  it("builds a triangular grid: header offsets + padded rows", () => {
    const vm = cohortGrid(report());
    expect(vm.offsetHeaders).toEqual([0, 1, 2]);
    expect(vm.rows[0]!.cells.map((c) => c.value)).toEqual(["100.0%", "75.0%", "25.0%"]);
    // Feb cohort is padded with a blank at offset 2.
    expect(vm.rows[1]!.cells[2]).toMatchObject({ value: "", present: false });
  });
});

describe("month-range helpers", () => {
  it("defaults to the 12 months ending this month (inclusive)", () => {
    const r = defaultCohortRange(new Date("2026-06-14T12:00:00Z"));
    expect(r.toMonth).toBe("2026-06");
    expect(r.fromMonth).toBe("2025-07");
  });

  it("validates fromMonth <= toMonth and the YYYY-MM shape", () => {
    expect(isValidCohortRange({ fromMonth: "2026-01", toMonth: "2026-03" })).toBe(true);
    expect(isValidCohortRange({ fromMonth: "2026-03", toMonth: "2026-01" })).toBe(false);
    expect(isValidCohortRange({ fromMonth: "2026-13", toMonth: "2026-03" })).toBe(false);
    expect(isValidCohortRange({ fromMonth: "", toMonth: "2026-03" })).toBe(false);
  });
});
