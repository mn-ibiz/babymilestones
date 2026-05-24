# Story 3.8: Statement export (CSV) for a parent

Status: done

> Canonical ID: P1-E03-S08 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S08.md

## Story

As a parent,
I want to download my wallet statement for a date range,
so that I have a record of my transactions for my own books.

## Acceptance Criteria

1. Date-range CSV: timestamp, kind, direction, amount, balance after, reference.
2. Available from parent dashboard and admin Reception screen.
3. Generated synchronously for ranges ≤ 12 months; async otherwise.

## Tasks / Subtasks

- [x] Task 1: Implement statement generation (AC: #1)
  - [x] `packages/wallet/src/statement.ts`: query `wallet_ledger` for a wallet over a date range ordered chronologically (by `created_at`, `id` tiebreak); emit CSV columns `timestamp, kind, direction, amount, balance after, reference`, computing running balance-after from the ledger (seeded by pre-window postings; amounts integer cents → `formatCents` KES with two decimals; RFC-4180 field escaping).
- [x] Task 2: Sync vs async dispatch (AC: #3)
  - [x] `isAsyncRange` (calendar-month cutoff): ranges ≤ 12 months generate synchronously and stream the CSV (200); longer ranges enqueue an async job and return 202. Async worker registered via `registerWalletStatementJob` in `apps/jobs/src/index.ts` (`createWalletStatementJob`), sharing `generateStatementCsv` so sync/async output is identical.
- [x] Task 3: Expose endpoints (AC: #2)
  - [x] `apps/api/src/routes/parents/statement.ts`: `GET /parents/me/statement` (parent, own wallet from session) + `GET /parents/:userId/statement` (staff `read wallet` only; parents blocked via `isStaffRole` to prevent cross-parent traversal). Client libs `apps/platform/lib/statement-api.ts` (parent) + `apps/admin/lib/statement-api.ts` (Reception). Full dashboard pages belong to E10/E11; libs match the existing `*-api.ts` hook pattern.
- [x] Task 4: Tests (all)
  - [x] `statement.test.ts` (wallet): columns/ordering/running-balance, pre-window seed, empty case, wallet scoping, `formatCents`, `isAsyncRange`. `statement.test.ts` (api): own export, empty, 401/400, staff export, parent-traversal 403, sync 200 vs async 202, audit, 404. Job + both client libs tested.

## Dev Notes

- Balance-after column is derived from the ledger running total (consistent with story 3.2 — balance is computed, never stored). Amounts are integer cents.
- The ≤ 12-month threshold is the sync/async cutoff; long ranges go through the `apps/jobs` worker to avoid blocking requests.
- Lives in `packages/wallet/statement.ts` (generation), `apps/api/src/routes/` (endpoints), `apps/platform` + `apps/admin` (download UI), `apps/jobs/src/registry.ts` (async job).
- Testing standards: vitest, test-first; column correctness and the sync/async boundary are the key assertions.

### Project Structure Notes
- `packages/wallet/statement.ts`; `apps/api/src/routes/` export endpoint; UI hooks in `apps/platform` and `apps/admin`; async job in `apps/jobs`.
- Depends on P1-E03-S01 (ledger) and P1-E03-S02 (computed balance).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S08.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E03]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

Full gate green from repo root: `pnpm test` (all suites), `pnpm typecheck`, `pnpm lint`, `pnpm build`.

### Completion Notes List

- Statement generation is a pure read over `wallet_ledger`; balance-after is derived (P1-E03-S02 — never stored), seeded from postings strictly before the window so windowed statements stay consistent with the full ledger.
- Security: `/parents/me` scopes to the session userId; the by-id staff route gates on `isStaffRole` AND `read wallet` — parents also hold `read wallet`, so the role check is what blocks cross-parent traversal (covered by a 403 test).
- Async path (>12mo) shares `generateStatementCsv` with the sync path, so output is byte-identical; the API only enqueues + audits, the `wallet-statement` worker renders + delivers + audits completion.
- Client libs added in both apps following the existing `*-api.ts` pattern; full wallet pages are out of scope (E10/E11).

### File List

- packages/wallet/src/statement.ts (new)
- packages/wallet/src/statement.test.ts (new)
- packages/wallet/src/index.ts (exports)
- apps/api/src/routes/parents/statement.ts (new)
- apps/api/src/routes/parents/statement.test.ts (new)
- apps/api/src/routes/parents/index.ts (wire route + deps)
- apps/api/src/app.ts (enqueueStatement dep)
- apps/jobs/src/jobs/wallet-statement.ts (new)
- apps/jobs/src/jobs/wallet-statement.test.ts (new)
- apps/jobs/src/index.ts (register worker)
- apps/jobs/package.json (+@bm/wallet)
- apps/platform/lib/statement-api.ts (new)
- apps/platform/lib/statement-api.test.ts (new)
- apps/admin/lib/statement-api.ts (new)
- apps/admin/lib/statement-api.test.ts (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented statement CSV export (gen + sync/async API + worker + client libs); full gate green | claude-opus-4-7 |
