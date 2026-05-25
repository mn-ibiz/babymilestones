# Story 25.4: Reassign a salon booking between stylists

Status: backlog

> Canonical ID: P3-E03-S04 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S04.md

## Story

As Reception, I want to move a child to a different stylist on the day if needed.

## Acceptance Criteria

1. Drag/select-and-reassign in the daily view.
2. New stylist must be available; double-book prevented.
3. Attribution snapshot updated; audit recorded.
4. If service already settled (rare), commission lines move proportionally.

## Tasks / Subtasks

- [ ] Task 1: Implement Reassign a salon booking between stylists (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Drag/select-and-reassign in the daily view.
  - [ ] Satisfy AC#2: New stylist must be available; double-book prevented.
  - [ ] Satisfy AC#3: Attribution snapshot updated; audit recorded.
  - [ ] Satisfy AC#4: If service already settled (rare), commission lines move proportionally.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E03.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
