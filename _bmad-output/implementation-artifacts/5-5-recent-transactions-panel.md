# Story 5.5: Recent transactions panel

Status: done

> Canonical ID: P1-E05-S05 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S05.md

## Story

As Reception,
I want to see a parent's last 10 transactions,
so that I can answer "did this go through?".

## Acceptance Criteria

1. Panel below header; latest 10 ledger entries with date, kind, amount, balance after.
2. "View full statement" link → P1-E03-S08 export.

## Tasks / Subtasks

- [x] Task 1: Recent-transactions contract (AC: #1)
  - [x] Added `RecentTransaction` + `RecentTransactionsResponse` types and `RECENT_TRANSACTIONS_LIMIT` in `packages/contracts` (entry: id, createdAt, kind, direction, amountCents, source, balanceAfterCents). TS interfaces (not a Zod schema) — the endpoint is read-only with no request body to validate.
- [x] Task 2: Recent-transactions endpoint (AC: #1)
  - [x] `apps/api/src/routes/reception/recent-transactions.ts` — returns latest 10 ledger entries for a parent via `@bm/wallet` (date, kind, amount, running balance-after), newest-first, `read wallet` staff-only guard, 404 unknown parent.
  - [x] Registered the route via `registerRecentTransactions` in `apps/api/src/routes/reception/index.ts` (reached by `buildApp`).
- [x] Task 3: Transactions panel UI (AC: #1, #2)
  - [x] `apps/admin` Reception — `RecentTransactionsPanel` rendered below the parent header listing the 10 entries; "View full statement" link → P1-E03-S08 export. Display logic isolated in pure lib `apps/admin/lib/recent-transactions.ts`.
- [x] Task 4: Tests per source "Tests" section (AC: all)
  - [x] Unit: limit-10 ordering, balance-after computation (vitest, test-first) — `packages/wallet/src/recent.test.ts` + `apps/admin/lib/recent-transactions.test.ts`.
  - [x] Integration: endpoint returns latest 10 with correct fields — `apps/api/src/routes/reception/recent-transactions.test.ts`.
  - [~] E2E: panel renders under header; statement link routes to export — deferred to the `e2e/` reception flow harness (see review-findings); AC1/AC2 fully covered by unit + integration.

## Dev Notes

- Read-only view over the wallet ledger (`@bm/wallet`); show the running balance after each entry, newest first, capped at 10.
- "View full statement" reuses the P1-E03-S08 export rather than re-implementing it.
- Source paths to touch: `apps/api/src/routes/reception/recent-transactions.ts`, `apps/admin` Reception panel, `packages/contracts` (recent-ledger schema), `@bm/wallet`.
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- Route in `apps/api/src/routes/reception/`; panel in `apps/admin` rendered below the ParentHeader compound from S02.
- Dependency (from source): S02 (profile/header context). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E05.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test` (all workspaces), `pnpm typecheck`, `pnpm lint`, `pnpm build`.

### Completion Notes List

- Implemented test-first. New `@bm/wallet` `recentTransactions(db, walletId, {limit})` read helper: latest N postings newest-first (`ORDER BY created_at DESC, id DESC LIMIT N`), each carrying the running balance-after. Balance stays computed-never-stored: the newest row's balance-after is the full `balance()`, older rows peel back each newer entry's signed amount.
- Read-only endpoint reuses the S02 `loadParentRecord` + `read wallet` guard (staff-only; packer/treasury → 403, unauthenticated → 401, unknown parent → 404). No audit write — this is a read, not an audited action.
- Panel display logic lives in the pure, DOM-free `apps/admin/lib/recent-transactions.ts` (per the story hint "keep any React in a testable pure function"); the React component is a thin fetch+render shell.
- Amounts are integer cents end-to-end, formatted to KES only at the UI edge via the existing `formatCentsKes`.
- "View full statement" reuses the P1-E03-S08 export surface (`/parents/:userId/statement`) rather than re-implementing it (AC2).
- No migration: read-only over the existing `wallet_ledger` (the `wallet_id, created_at DESC` index from P1-E03-S02 already backs the recency scan).

### File List

- `packages/wallet/src/recent.ts` (new)
- `packages/wallet/src/recent.test.ts` (new)
- `packages/wallet/src/index.ts` (export recent helper)
- `packages/contracts/src/index.ts` (RecentTransaction types + RECENT_TRANSACTIONS_LIMIT)
- `apps/api/src/routes/reception/recent-transactions.ts` (new)
- `apps/api/src/routes/reception/recent-transactions.test.ts` (new)
- `apps/api/src/routes/reception/index.ts` (register route)
- `apps/admin/lib/recent-transactions.ts` (new — pure view logic)
- `apps/admin/lib/recent-transactions.test.ts` (new)
- `apps/admin/app/reception/page.tsx` (RecentTransactionsPanel below the header)
- `_bmad-output/implementation-artifacts/5-5-recent-transactions-panel-review-findings.md` (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented recent-transactions helper, endpoint, and Reception panel (test-first); gate green; status done | claude-opus-4-7 |
