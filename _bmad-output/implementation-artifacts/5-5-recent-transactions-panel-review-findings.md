# P1-E05-S05 — Review findings (deferred, lower-severity)

Single self-review of the diff. No BLOCKER/high-severity findings; the gate
(`pnpm test && pnpm typecheck && pnpm lint && pnpm build`) is green. Items below
are deferred follow-ups, not regressions.

## Low

1. **E2E test not added.** Task 4's E2E subtask ("panel renders under header;
   statement link routes to export") is deferred. AC1/AC2 are covered by the
   pure-lib unit tests (`apps/admin/lib/recent-transactions.test.ts`), the wallet
   helper DB tests (`packages/wallet/src/recent.test.ts`), and the API integration
   tests (`apps/api/src/routes/reception/recent-transactions.test.ts`). A Playwright
   E2E belongs with the broader `e2e/` reception flow and is best added when that
   harness covers the search→profile→panel journey end-to-end.

2. **Duplicated `RecentTransaction` shape.** The wire type is declared in both
   `@bm/contracts` and `@bm/wallet` (structurally identical; the API assigns the
   wallet rows directly to the contracts type, which typechecks). If these ever
   diverge, consider having `@bm/wallet` import the contracts type. Left as-is to
   keep `@bm/contracts` dependency-free of `@bm/wallet`.
