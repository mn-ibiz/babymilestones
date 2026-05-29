# Story 18.4: Observations feed in parent's account

Status: done

> Canonical ID: P2-E03-S04 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S04.md

## Story

As parent,
I want to read what my child did at every session in one place,
so that the capability described above is delivered.

## Acceptance Criteria

1. Per-child timeline: mood, activities, free-text note, attendant name, date.
2. Filterable by date range and service.
3. Read-only.

## Tasks / Subtasks

- [x] Task 1: Implement Observations feed in parent's account (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Per-child timeline: mood, activities, free-text note, attendant name, date.
  - [x] Satisfy AC#2: Filterable by date range and service.
  - [x] Satisfy AC#3: Read-only.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

### Review Follow-ups (AI)

- [x] [AI-Review][Low] Guard a non-uuid `serviceId` filter (drop it) so it can't reach the uuid column and surface as a 500; test added.
- [x] [AI-Review][Med] Cap the feed at `OBSERVATION_FEED_LIMIT` (200, newest-first) — no longer unbounded.
- [x] [AI-Review][Low] Documented UTC-day filtering (consistent with the rest of the platform) + the deliberate archived-child read access + the type-narrowing coalesce.

### Code Review (2026-05-29 · 10-agent parallel review + full suite)

- [x] [Review][Patch] Coerce repeated/array query params (`from`/`to`/`serviceId`) to their first value, so a duplicated `?serviceId=` no longer defeats the uuid guard and silently drops the service filter. [observations.ts]
- [x] [Review][Patch] Platform timeline now resets its error state on each refetch, so a transient failure no longer strands the page on the error screen with the filter controls unmounted. [observations/page.tsx]
- [x] [Review][Verify] AC1–AC3 confirmed; ownership 404, anonymised-row drop-out, and the clean public projection (no internal-field leakage) re-verified.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E03.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story workflow)

### Debug Log References

- `pnpm vitest run src/routes/parents/observations.test.ts` (apps/api) — 5/5 green.
- `pnpm turbo run test` — full regression 17/17 packages green (API 509).

### Completion Notes List

- AC1/AC3: read-only `GET /parents/me/children/:childId/observations` returns a per-child timeline (mood, activities, note, attendant name, date), newest-first. No mutation, no audit (reads are never audited per the catalogue rule).
- AC2: filterable by `from`/`to` (UTC calendar day, inclusive) and `serviceId` (via the booking→service join). Invalid params are ignored rather than 500ing.
- Ownership derived server-side; anonymised rows (S05 NULLs child_id) drop out of the per-child query automatically.
- Platform timeline page at `app/(app)/children/[childId]/observations` with date + service filters; shared `filterObservations` contract rule + `serviceOptions` helper unit-tested.
- ✅ Resolved review [Med] feed cap, [Low×2] non-uuid serviceId guard + doc clarifications.

### File List

- packages/contracts/src/index.ts (modified — ObservationFeedItem/Filter, filterObservations, OBSERVATION_FEED_LIMIT)
- apps/api/src/routes/parents/observations.ts (new)
- apps/api/src/routes/parents/observations.test.ts (new)
- apps/api/src/routes/parents/index.ts (modified — wired route)
- apps/platform/lib/observations.ts (new)
- apps/platform/lib/observations.test.ts (new)
- apps/platform/lib/observations-api.ts (new)
- apps/platform/app/(app)/children/[childId]/observations/page.tsx (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 1.0 | Implemented read-only observations feed (filterable timeline + parent UI), TDD; code review + 3 fixes resolved; status → review | bmad-dev-story |
