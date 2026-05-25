# Story 18.4: Observations feed in parent's account

Status: backlog

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

- [ ] Task 1: Implement Observations feed in parent's account (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Per-child timeline: mood, activities, free-text note, attendant name, date.
  - [ ] Satisfy AC#2: Filterable by date range and service.
  - [ ] Satisfy AC#3: Read-only.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
