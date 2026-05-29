# Story 18.5: 24-month retention + anonymisation

Status: done

> Canonical ID: P2-E03-S05 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S05.md

## Story

As data-protection officer,
I want observation free-text auto-anonymised after 24 months,
so that the capability described above is delivered.

## Acceptance Criteria

1. Nightly job scans `attendances.observations` older than 24 months.
2. Strips `parent_id` and `child_id`; replaces names in free-text with `[child]`/`[parent]` using regex on first names.
3. Aggregate text retained for operational learning; PII cleared.
4. Job run + count logged.

## Tasks / Subtasks

- [x] Task 1: Implement 24-month retention + anonymisation (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: Nightly job scans `observations` older than 24 months.
  - [x] Satisfy AC#2: Strips `parent_id` and `child_id`; replaces names in free-text with `[child]`/`[parent]` using regex on first names.
  - [x] Satisfy AC#3: Aggregate text retained for operational learning; PII cleared.
  - [x] Satisfy AC#4: Job run + count logged.
  - [x] Touch / create: `apps/jobs/src/jobs/anonymise-observations.ts` (jobs-framework path; the spec's `apps/jobs/anonymise/observations.ts` is the conceptual location — implemented as a registered `createAnonymiseObservationsJob` per the established registry pattern).
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

### Review Follow-ups (AI)

- [x] [AI-Review][Med] Scrub last names too (defence-in-depth beyond the AC's "first names"); surname-scrub test added.
- [x] [AI-Review][Med] Documented that `attendant_name_snapshot` is retained intentionally — staff operational attribution, not the anonymised subject's PII.
- [x] [AI-Review][Med] Warn (with a count) when an owner row's name can't be resolved, so a potential un-scrubbed-PII miss is never silently sealed.
- [x] [AI-Review][Med] Per-row error isolation — a bad row is logged + counted and never aborts the nightly run.
- [x] [AI-Review][Med] Bounded batch drain loop (no wholesale load of a large first-run backlog).
- [x] [AI-Review][Low] `subtractMonths` clamps month-end dates (no overflow into the next month); clamp test added.
- [x] [AI-Review][Low] Audit payload now records the cleared (opaque-UUID) child_id/parent_id for a forensic trail.

### Code Review (2026-05-29 · 10-agent parallel review + full suite)

- [x] [Review][Patch][High] Replaced the `progressed===0` early-break with a failed-id exclusion, so a full page of failing oldest rows can no longer starve newer (still-expired) rows — the scan now drains the whole backlog and retries failures on the next run. Regression test added.
- [x] [Review][Patch] Unresolved-owner path (FK-unreachable; defensive) now clears the note instead of sealing un-scrubbed PII into a row marked "anonymised".
- [x] [Review][Verify] AC1–AC4 (24-month cutoff + month-end clamp, PII strip + first/last-name scrub, aggregate retention, run/count log) re-confirmed; idempotency re-tested.

## Dev Notes

`apps/jobs/anonymise/observations.ts`. Decision 29.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E03.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story workflow)

### Debug Log References

- `pnpm vitest run src/jobs/anonymise-observations.test.ts` (apps/jobs) — 8/8 green.
- `pnpm turbo run test` — full regression 17/17 packages green (jobs 52).

### Completion Notes List

- AC1: `createAnonymiseObservationsJob` (daily `intervalMs`) scans `observations` older than 24 months and not yet anonymised, oldest-first, in bounded batches.
- AC2: strips `child_id` + `parent_id` and scrubs the child's + parent's first AND last names from the free-text `note` (case-insensitive, word-bounded, regex-escaped).
- AC3: mood, activities and the scrubbed note are retained; only PII is cleared. (`attendant_name_snapshot` is retained as staff attribution — not the data subject's PII.)
- AC4: the run logs `{event, count, failed, unresolved, cutoff}`; each row's clear + `observation.anonymised` audit commit in one transaction (outbox). Idempotent (re-run is a no-op).
- Registered via `registerAnonymiseObservationsJob` in `apps/jobs/src/index.ts`, consistent with the sibling crons.
- ✅ Resolved review [Med×4] (surname scrub, attendant retention rationale, unresolved-name warning, per-row isolation + bounded drain) and [Low×2] (month-end clamp, audit forensic ids).

### File List

- apps/jobs/src/jobs/anonymise-observations.ts (new)
- apps/jobs/src/jobs/anonymise-observations.test.ts (new)
- apps/jobs/src/index.ts (modified — export + registerAnonymiseObservationsJob wiring)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 1.0 | Implemented nightly observation anonymisation cron (PII strip + name scrub + retained aggregate text + logged count), TDD; code review + 6 fixes resolved; status → review | bmad-dev-story |
