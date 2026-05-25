/**
 * Parent shell perf-budget helpers (P1-E11-S05).
 *
 * AC3 caps the initial JS for any parent route at 200 KB gzipped. We express
 * that budget as a pure, testable constant + predicate so it can be asserted in
 * unit tests and reused by a build-time bundle check. The shell itself is a
 * server component with a single small client nav island, which keeps initial
 * JS comfortably under this ceiling.
 */

/** Hard ceiling for initial route JS, in gzipped bytes (AC3). */
export const INITIAL_JS_BUDGET_BYTES = 200 * 1024;

/** True when a measured gzipped initial-JS size is within budget (AC3). */
export function withinInitialJsBudget(gzippedBytes: number): boolean {
  return gzippedBytes <= INITIAL_JS_BUDGET_BYTES;
}
