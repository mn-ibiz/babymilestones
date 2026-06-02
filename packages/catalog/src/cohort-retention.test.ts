import { describe, expect, it } from "vitest";
import {
  aggregateCohortRetention,
  ACTIVE_WINDOW_DAYS,
  type CohortParentRow,
  type CohortRetentionInput,
} from "./cohort-retention.js";

/**
 * P5-E?-S?? (Story 35.2) — pure cohort-retention aggregation. Given each parent's
 * signup MONTH and the set of calendar months in which that parent had at least one
 * paid touchpoint (a wallet debit, by default — the configurable "active" signal),
 * derive the retention matrix:
 *  - rows = signup month cohorts,
 *  - columns = months-since-signup offset k (0,1,2,…),
 *  - each cell = % of the cohort with a paid touchpoint in calendar-month
 *    (signupMonth + k) (AC1).
 * Exhaustively unit-tested — no I/O.
 */

function parent(over: Partial<CohortParentRow> = {}): CohortParentRow {
  return {
    parentId: over.parentId ?? "p1",
    signupMonth: over.signupMonth ?? "2026-01",
    activeMonths: over.activeMonths ?? [],
  };
}

function input(over: Partial<CohortRetentionInput> = {}): CohortRetentionInput {
  return {
    fromMonth: over.fromMonth ?? "2026-01",
    toMonth: over.toMonth ?? "2026-03",
    asOfMonth: over.asOfMonth ?? "2026-03",
    parents: over.parents ?? [],
  };
}

describe("aggregateCohortRetention (Story 35.2)", () => {
  it("exposes the default active window as a named constant (AC2)", () => {
    expect(ACTIVE_WINDOW_DAYS).toBe(30);
  });

  it("empty input: no cohorts, no matrix rows", () => {
    const m = aggregateCohortRetention(input({ parents: [] }));
    expect(m.fromMonth).toBe("2026-01");
    expect(m.toMonth).toBe("2026-03");
    expect(m.cohorts).toEqual([]);
    expect(m.maxOffset).toBe(0);
  });

  it("single parent active in offset 0 and 2 but NOT 1 (AC1)", () => {
    // Signed up Jan; active Jan (offset 0) and Mar (offset 2), not Feb (offset 1).
    const m = aggregateCohortRetention(
      input({
        fromMonth: "2026-01",
        toMonth: "2026-01",
        asOfMonth: "2026-03",
        parents: [
          parent({
            parentId: "p1",
            signupMonth: "2026-01",
            activeMonths: ["2026-01", "2026-03"],
          }),
        ],
      }),
    );
    expect(m.cohorts).toHaveLength(1);
    const c = m.cohorts[0]!;
    expect(c.signupMonth).toBe("2026-01");
    expect(c.cohortSize).toBe(1);
    // Offsets 0,1,2 are observable (asOf is Mar, signup Jan).
    expect(c.cells.map((x) => x.offset)).toEqual([0, 1, 2]);
    const byOffset = Object.fromEntries(c.cells.map((x) => [x.offset, x]));
    expect(byOffset[0]).toMatchObject({ retained: 1, percentage: 100 });
    expect(byOffset[1]).toMatchObject({ retained: 0, percentage: 0 });
    expect(byOffset[2]).toMatchObject({ retained: 1, percentage: 100 });
  });

  it("computes cohort percentage across a multi-parent cohort (AC1)", () => {
    // Jan cohort of 4. Offset 1 (Feb): 3 of 4 active → 75%.
    const m = aggregateCohortRetention(
      input({
        fromMonth: "2026-01",
        toMonth: "2026-01",
        asOfMonth: "2026-02",
        parents: [
          parent({ parentId: "a", signupMonth: "2026-01", activeMonths: ["2026-01", "2026-02"] }),
          parent({ parentId: "b", signupMonth: "2026-01", activeMonths: ["2026-01", "2026-02"] }),
          parent({ parentId: "c", signupMonth: "2026-01", activeMonths: ["2026-02"] }),
          parent({ parentId: "d", signupMonth: "2026-01", activeMonths: ["2026-01"] }),
        ],
      }),
    );
    const c = m.cohorts[0]!;
    expect(c.cohortSize).toBe(4);
    const byOffset = Object.fromEntries(c.cells.map((x) => [x.offset, x]));
    // Offset 0 (Jan): a,b,d active → 3/4 = 75%.
    expect(byOffset[0]).toMatchObject({ retained: 3, percentage: 75 });
    // Offset 1 (Feb): a,b,c active → 3/4 = 75%.
    expect(byOffset[1]).toMatchObject({ retained: 3, percentage: 75 });
  });

  it("rounds the percentage to one decimal place (AC1)", () => {
    // 1 of 3 active = 33.333… → 33.3.
    const m = aggregateCohortRetention(
      input({
        fromMonth: "2026-01",
        toMonth: "2026-01",
        asOfMonth: "2026-01",
        parents: [
          parent({ parentId: "a", signupMonth: "2026-01", activeMonths: ["2026-01"] }),
          parent({ parentId: "b", signupMonth: "2026-01", activeMonths: [] }),
          parent({ parentId: "c", signupMonth: "2026-01", activeMonths: [] }),
        ],
      }),
    );
    expect(m.cohorts[0]!.cells[0]).toMatchObject({ retained: 1, percentage: 33.3 });
  });

  it("builds multiple cohorts, each with its own offset span (AC1)", () => {
    const m = aggregateCohortRetention(
      input({
        fromMonth: "2026-01",
        toMonth: "2026-02",
        asOfMonth: "2026-03",
        parents: [
          parent({ parentId: "a", signupMonth: "2026-01", activeMonths: ["2026-01", "2026-02", "2026-03"] }),
          parent({ parentId: "b", signupMonth: "2026-02", activeMonths: ["2026-02"] }),
        ],
      }),
    );
    expect(m.cohorts.map((c) => c.signupMonth)).toEqual(["2026-01", "2026-02"]);
    // Jan cohort observed Jan..Mar → offsets 0,1,2.
    expect(m.cohorts[0]!.cells.map((x) => x.offset)).toEqual([0, 1, 2]);
    // Feb cohort observed Feb..Mar → offsets 0,1.
    expect(m.cohorts[1]!.cells.map((x) => x.offset)).toEqual([0, 1]);
    // maxOffset is the widest cohort's last offset (Jan → 2).
    expect(m.maxOffset).toBe(2);
  });

  it("includes an empty cohort (a signup month with zero parents) only when it has signups", () => {
    // Only Jan + Mar have signups; Feb cohort is absent (no parents signed up in Feb).
    const m = aggregateCohortRetention(
      input({
        fromMonth: "2026-01",
        toMonth: "2026-03",
        asOfMonth: "2026-03",
        parents: [
          parent({ parentId: "a", signupMonth: "2026-01", activeMonths: ["2026-01"] }),
          parent({ parentId: "b", signupMonth: "2026-03", activeMonths: ["2026-03"] }),
        ],
      }),
    );
    expect(m.cohorts.map((c) => c.signupMonth)).toEqual(["2026-01", "2026-03"]);
  });

  it("does NOT over-count the current partial month: offsets beyond asOf are omitted (AC1)", () => {
    // Jan cohort, asOf is Feb. Only offsets 0 (Jan) + 1 (Feb) are over; March+ unknown.
    const m = aggregateCohortRetention(
      input({
        fromMonth: "2026-01",
        toMonth: "2026-01",
        asOfMonth: "2026-02",
        parents: [parent({ parentId: "a", signupMonth: "2026-01", activeMonths: ["2026-01", "2026-02"] })],
      }),
    );
    const c = m.cohorts[0]!;
    expect(c.cells.map((x) => x.offset)).toEqual([0, 1]);
    // No offset 2 cell (March hasn't completed relative to asOf Feb).
    expect(c.cells.find((x) => x.offset === 2)).toBeUndefined();
  });

  it("excludes parents whose signup month is outside [fromMonth, toMonth] (date-range cohort selection)", () => {
    const m = aggregateCohortRetention(
      input({
        fromMonth: "2026-02",
        toMonth: "2026-02",
        asOfMonth: "2026-03",
        parents: [
          parent({ parentId: "early", signupMonth: "2026-01", activeMonths: ["2026-01"] }),
          parent({ parentId: "in", signupMonth: "2026-02", activeMonths: ["2026-02"] }),
          parent({ parentId: "late", signupMonth: "2026-03", activeMonths: ["2026-03"] }),
        ],
      }),
    );
    expect(m.cohorts.map((c) => c.signupMonth)).toEqual(["2026-02"]);
    expect(m.cohorts[0]!.cohortSize).toBe(1);
  });

  it("ignores active months before a parent's signup (no negative offsets)", () => {
    const m = aggregateCohortRetention(
      input({
        fromMonth: "2026-02",
        toMonth: "2026-02",
        asOfMonth: "2026-02",
        parents: [
          // A stray pre-signup active month must not create a negative offset cell.
          parent({ parentId: "a", signupMonth: "2026-02", activeMonths: ["2026-01", "2026-02"] }),
        ],
      }),
    );
    const c = m.cohorts[0]!;
    expect(c.cells.map((x) => x.offset)).toEqual([0]);
    expect(c.cells[0]).toMatchObject({ retained: 1, percentage: 100 });
  });
});
