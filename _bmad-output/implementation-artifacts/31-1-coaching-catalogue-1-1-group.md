# Story 31.1: Coaching catalogue (1:1 + group)

Status: backlog

> Canonical ID: P5-E01-S01 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E01-S01.md

## Story

As admin, I want to manage coaching offerings across pregnancy → birth → early parenting.

## Acceptance Criteria

1. New unit `coaching` in the service taxonomy.
2. Each offering: name, description, format (`one_to_one`|`group`), price, duration, optional age-stage tags ("expecting", "0-3mo", "3-6mo"...).
3. Coach assigned as a `staff` record (no login).
4. Admin CRUD with audit.

## Tasks / Subtasks

- [ ] Task 1: Implement Coaching catalogue (1:1 + group) (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: New unit `coaching` in the service taxonomy.
  - [ ] Satisfy AC#2: Each offering: name, description, format (`one_to_one`|`group`), price, duration, optional age-stage tags ("expecting", "0-3mo", "3-6mo"...).
  - [ ] Satisfy AC#3: Coach assigned as a `staff` record (no login).
  - [ ] Satisfy AC#4: Admin CRUD with audit.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P1-E07 - P3-E01-S01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E01-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E01.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
