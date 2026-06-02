/**
 * P5 (Story 35.2) — Cohort retention by signup month.
 *
 * A pure read-model that turns each parent's signup MONTH plus the set of calendar
 * months in which that parent had at least one PAID TOUCHPOINT into a triangular
 * retention matrix (AC1):
 *
 *  - rows    = signup-month cohorts (`YYYY-MM`),
 *  - columns = months-since-signup offset k (0, 1, 2, …),
 *  - each cell = % of the cohort still ACTIVE in calendar-month (signupMonth + k):
 *    `retained / cohortSize`, where a parent is "retained at offset k" iff their
 *    active-month set contains the calendar month (signupMonth + k).
 *
 * "ACTIVE" definition (AC2) — CONFIGURABLE. The DB read derives each parent's
 * active-month set from a paid touchpoint signal; the DEFAULT is a wallet `debit`
 * ledger entry (real money spent on a service) within the month, which is the
 * codebase's canonical "a parent paid for a touchpoint" event. {@link ACTIVE_WINDOW_DAYS}
 * names the default rolling-window length (30 days) that the default signal honours;
 * the matrix itself is month-offset based — "active in offset k" means at least one
 * paid touchpoint landed in that whole calendar month. Both the window length and the
 * touchpoint signal are overridable at the DB-read seam (see `cohort-retention-db.ts`),
 * so swapping the definition (e.g. completed bookings, settled invoices) re-shapes the
 * matrix without touching this reducer.
 *
 * The DB read ({@link loadCohortRetention} in `cohort-retention-db.ts`) stays a thin
 * projection so this aggregation is exhaustively unit-tested with no I/O — the same
 * split the rest of Epic-27 reporting uses.
 *
 * Current partial month is NOT over-counted: a cohort only exposes offsets up to
 * `asOfMonth` (the last fully-observable month), so a half-finished current month
 * never reports a misleadingly low retention.
 */

/**
 * Default "active" rolling window in days (AC2). Names the default touchpoint
 * recency the active signal honours ("at least 1 paid touchpoint in the last 30
 * days"). The matrix is month-offset based, but this constant is the named,
 * overridable parameter the active definition keys off.
 */
export const ACTIVE_WINDOW_DAYS = 30;

/** One parent projected to exactly what the cohort matrix needs. */
export interface CohortParentRow {
  parentId: string;
  /** The parent's signup month, `YYYY-MM`. */
  signupMonth: string;
  /**
   * The distinct calendar months (`YYYY-MM`) in which the parent had at least one
   * paid touchpoint — the derived "active" set. Order/duplicates don't matter.
   */
  activeMonths: readonly string[];
}

/** The inputs the cohort aggregation reduces — the DB read hands these in. */
export interface CohortRetentionInput {
  /** Inclusive lower bound of signup-month cohorts to include (`YYYY-MM`). */
  fromMonth: string;
  /** Inclusive upper bound of signup-month cohorts to include (`YYYY-MM`). */
  toMonth: string;
  /**
   * The last fully-observable calendar month (`YYYY-MM`) — typically "this month".
   * Cohorts only expose offsets whose calendar month is `<= asOfMonth`, so the
   * current partial month is never over-counted (AC1).
   */
  asOfMonth: string;
  /** Every parent (signup month + derived active-month set). */
  parents: readonly CohortParentRow[];
}

/** One cell of the matrix: the cohort's retention at a given month offset. */
export interface CohortCell {
  /** Months since signup (0 = signup month itself). */
  offset: number;
  /** How many of the cohort were active in calendar-month (signupMonth + offset). */
  retained: number;
  /** `retained / cohortSize` as a percentage, rounded to one decimal place. */
  percentage: number;
}

/** One cohort row: a signup month + its size + the per-offset retention cells. */
export interface CohortRow {
  signupMonth: string;
  cohortSize: number;
  /** Cells for offsets 0..lastObservableOffset, in ascending offset order. */
  cells: CohortCell[];
}

/** The fully-reduced cohort-retention matrix (AC1). */
export interface CohortRetentionMatrix {
  fromMonth: string;
  toMonth: string;
  asOfMonth: string;
  /** Cohort rows in ascending signup-month order. */
  cohorts: CohortRow[];
  /** The widest cohort's last offset — the number of matrix columns minus one. */
  maxOffset: number;
}

/** `YYYY-MM` → a comparable integer index (year*12 + month), for offset math. */
function monthIndex(month: string): number {
  const [y, m] = month.split("-");
  return Number(y) * 12 + (Number(m) - 1);
}

/** Round to one decimal place (e.g. 33.333… → 33.3). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Reduce per-parent signup months + active-month sets to the cohort retention
 * matrix (AC1). Pure — no I/O.
 *
 * For each signup-month cohort in `[fromMonth, toMonth]` and each month-offset k
 * whose calendar month `(signupMonth + k) <= asOfMonth`, the cell is the % of the
 * cohort whose active-month set contains `(signupMonth + k)`. Cohorts are emitted
 * only for signup months that actually have parents; offsets stop at `asOfMonth`
 * so the current partial month is never over-counted.
 */
export function aggregateCohortRetention(
  inputData: CohortRetentionInput,
): CohortRetentionMatrix {
  const fromIdx = monthIndex(inputData.fromMonth);
  const toIdx = monthIndex(inputData.toMonth);
  const asOfIdx = monthIndex(inputData.asOfMonth);

  // Group the in-range parents by signup month, pre-indexing their active months.
  const cohortMap = new Map<string, { active: Set<number> }[]>();
  for (const p of inputData.parents) {
    const signupIdx = monthIndex(p.signupMonth);
    if (signupIdx < fromIdx || signupIdx > toIdx) continue;
    const active = new Set(p.activeMonths.map(monthIndex));
    const list = cohortMap.get(p.signupMonth) ?? [];
    list.push({ active });
    cohortMap.set(p.signupMonth, list);
  }

  const cohorts: CohortRow[] = [];
  let maxOffset = 0;

  for (const [signupMonth, members] of cohortMap) {
    const signupIdx = monthIndex(signupMonth);
    // Offsets are observable from 0 up to (asOf − signup), clamped at >= 0.
    const lastOffset = asOfIdx - signupIdx;
    const cells: CohortCell[] = [];
    for (let offset = 0; offset <= lastOffset; offset += 1) {
      const calMonthIdx = signupIdx + offset;
      let retained = 0;
      for (const m of members) {
        if (m.active.has(calMonthIdx)) retained += 1;
      }
      cells.push({
        offset,
        retained,
        percentage: round1((retained / members.length) * 100),
      });
    }
    if (lastOffset > maxOffset) maxOffset = lastOffset;
    cohorts.push({ signupMonth, cohortSize: members.length, cells });
  }

  cohorts.sort((a, b) => (a.signupMonth < b.signupMonth ? -1 : a.signupMonth > b.signupMonth ? 1 : 0));

  return {
    fromMonth: inputData.fromMonth,
    toMonth: inputData.toMonth,
    asOfMonth: inputData.asOfMonth,
    cohorts,
    maxOffset,
  };
}
