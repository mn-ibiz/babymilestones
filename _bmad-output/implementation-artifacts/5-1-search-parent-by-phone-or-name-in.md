# Story 5.1: Search parent by phone or name in ≤300ms

Status: ready-for-dev

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

- [ ] Task 1: Search indexes on parents (AC: #2)
  - [ ] Add additive migration in `packages/db` — trigram (`pg_trgm`) index on `parents.name`; btree index on `parents.phone_normalized`
  - [ ] Seed/extend a 10k-parent fixture for perf testing in `packages/db` test fixtures
- [ ] Task 2: Search query + contract (AC: #1, #2, #3)
  - [ ] Add parent-search Zod request/response schema in `packages/contracts` (query string → results: name, phone_last4, wallet_balance, outstanding, last_visit)
  - [ ] Query reuses phone normalisation from `@bm/auth` so phone in any format matches `phone_normalized`
- [ ] Task 3: Search route (AC: #1, #2, #3)
  - [ ] `apps/api/src/routes/reception/parents-search.ts` — accept query, run trigram/phone match, compute wallet balance via `@bm/wallet` and outstanding/last-visit, return ≤ shaped results
  - [ ] Register route in `apps/api/src/app.ts` (buildApp) under `routes/reception`
- [ ] Task 4: Reception search UI (AC: #1, #3, #4)
  - [ ] `apps/admin` Reception page — auto-focused search input, 200ms debounce, results list with name/phone-last4/balance/outstanding/last-visit
  - [ ] Click result → render parent profile in same page (client-side, no full reload)
- [ ] Task 5: Tests per source "Tests" section (AC: all)
  - [ ] Unit: phone-any-format → normalized match, result shaping (vitest, test-first)
  - [ ] Integration: search route returns correct fields; p95 ≤300ms against 10k fixtures
  - [ ] E2E: type query in Reception, click result, profile renders without reload

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
