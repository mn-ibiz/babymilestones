# Story 30.2: Public event listing + detail page

Status: backlog

> Canonical ID: P4-E05-S02 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S02.md

## Story

As parent or guest,
I want to browse upcoming events,
so that the capability described above is delivered.

## Acceptance Criteria

1. Public list on `apps/platform` (public group).
2. Each event detail page shows tiers, remaining capacity per tier, "Buy ticket" CTAs.
3. SEO-friendly URLs.

## Tasks / Subtasks

- [ ] Task 1: Implement Public event listing + detail page (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Public list on `apps/platform` (public group).
  - [ ] Satisfy AC#2: Each event detail page shows tiers, remaining capacity per tier, "Buy ticket" CTAs.
  - [ ] Satisfy AC#3: SEO-friendly URLs.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P4-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
