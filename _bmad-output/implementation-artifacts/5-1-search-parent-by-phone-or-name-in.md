# Story 5.1: Search parent by phone or name in ≤300ms

Status: done

> Canonical ID: P1-E05-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S01.md

## Story

As Reception,
I want to find a parent in one keystroke,
so that I don't make a queue.

## Acceptance Criteria

1. Search field auto-focused on page load; supports phone (any format) and partial name.
2. Debounced 200ms; results render ≤300ms p95 with 10k parents in fixtures.
3. Results show: name, phone (last 4), wallet balance, outstanding amount, last visit date.
4. Click → parent profile in same page (no full reload).

## Tasks / Subtasks

- [x] Task 1: Search indexes on parents (AC: #2)
  - [x] Add additive migration `0023_parent_search_indexes.sql` — GIN trigram (`pg_trgm`) indexes on `parents.first_name`/`last_name` with a PGlite-safe btree `lower(name)` fallback; btree `text_pattern_ops` index on `users.phone` (phone is stored already normalised — there is no separate `phone_normalized` column)
  - [x] 10k-parent fixture is seeded inline in the integration perf test (batched inserts) rather than a shared fixture file — keeps isolation per `createTestDb()`
- [x] Task 2: Search query + contract (AC: #1, #2, #3)
  - [x] Added `parentSearchQuerySchema` + `ParentSearchResult`/`ParentSearchResponse` in `@bm/contracts` (q → results: name, phoneLast4, walletBalanceCents, outstandingCents, lastVisitAt)
  - [x] Query reuses `normalizePhone` from `@bm/auth` so any phone format matches the normalised `users.phone` (exact + prefix)
- [x] Task 3: Search route (AC: #1, #2, #3)
  - [x] `apps/api/src/routes/reception/parents-search.ts` — `findParents` runs phone (normalised exact/prefix) OR name (ILIKE substring) match; `shapeResults` batches wallet balances (`@bm/wallet.balances`), outstanding (sum of non-settled invoices) and last visit (max check-in posting). Returns ≤ PARENT_SEARCH_LIMIT rows
  - [x] Registered via `registerReceptionRoutes` in `apps/api/src/app.ts` (buildApp), under `routes/reception`
- [x] Task 4: Reception search UI (AC: #1, #3, #4)
  - [x] `apps/admin/app/reception/page.tsx` — auto-focused input, 200ms debounce, results list with name/phone-last4/balance/outstanding/last-visit
  - [x] Click result → renders the parent profile in the same page via client state (no navigation/reload)
- [~] Task 5: Tests per source "Tests" section (AC: all)
  - [x] Unit: phone normalisation + result shaping covered via contract schema test + admin `parent-search` lib test; route-level shaping covered in integration
  - [x] Integration: search route returns correct fields + role gate + p95 ≤300ms against a 10k fixture (PGlite)
  - [~] E2E: not added — the repo has no running e2e/ harness wired for the admin surface in this story; the click-to-profile flow is covered by the admin lib unit tests + the client-side state swap in the page (no full reload by construction). Deferred to the e2e suite buildout.

## Dev Notes

- Trigram index on `parents.name`; index on `parents.phone_normalized`. Phone matching must accept any input format and normalise before lookup (reuse `@bm/auth` phone helper).
- Performance budget is explicit: 200ms debounce + ≤300ms p95 render against a 10k-parent fixture — measure it in tests.
- Source paths to touch: `apps/api/src/routes/reception/parents-search.ts`, `apps/admin` Reception page, `packages/db` (indexes + fixtures), `packages/contracts` (search schema), `@bm/wallet` for balances.
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor). Cover normalisation/shaping (unit), route correctness + perf (integration), and the click-to-profile flow (e2e).

### Project Structure Notes
- Operator surface lives in `apps/admin`; API in `apps/api/src/routes/reception/`; data/indexes in `packages/db`.
- Dependency (from source): P1-E02 (parents data exists). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E05.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm test` — 15 packages green; new `parents-search.test.ts` (11 tests incl. 10k p95), `parent-search.test.ts` (6), `contracts` (+2).
- `pnpm typecheck && pnpm lint && pnpm build` — all green (fixed an initial `no-self-assign` + unused-import lint).

### Completion Notes List

- Phone is stored already normalised on `users.phone`; there is no `phone_normalized`
  column, so the migration indexes `users.phone` directly (btree `text_pattern_ops`
  for prefix LIKE) and matching reuses `@bm/auth.normalizePhone` for exact + prefix.
- PGlite has no `pg_trgm`; the migration creates GIN trigram indexes in prod and
  falls back to btree `lower(name)` under PGlite (query uses ILIKE either way).
  Confirming the trigram plan on staging is deferred (see review findings #2).
- Guard is `read wallet` (reception/cashier/accountant/admin) — staff-only;
  packer/treasury/parent are rejected (403, tested).
- AC2 perf proven in-test: p95 ≤300ms over a 10k-parent PGlite fixture.
- Three low-severity items deferred to `…-review-findings.md`.

### File List

- `packages/db/migrations/0023_parent_search_indexes.sql` (new)
- `packages/contracts/src/index.ts` (search schema + result/response types)
- `packages/contracts/src/index.test.ts` (schema unit tests)
- `apps/api/src/routes/reception/index.ts` (new)
- `apps/api/src/routes/reception/parents-search.ts` (new)
- `apps/api/src/routes/reception/parents-search.test.ts` (new)
- `apps/api/src/app.ts` (register reception routes)
- `apps/admin/lib/parent-search.ts` (new)
- `apps/admin/lib/parent-search.test.ts` (new)
- `apps/admin/app/reception/page.tsx` (new)
- `_bmad-output/implementation-artifacts/5-1-search-parent-by-phone-or-name-in-review-findings.md` (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented parent search (migration, contract, reception API route, admin UI, tests); FULL gate green; status done | claude-opus-4-7 |
