# Story 27.5: Peak-hours heatmap

Status: backlog

> Canonical ID: P3-E05-S05 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S05.md

## Story

As admin, I want to understand when the complex is busiest so staffing tracks demand.

## Acceptance Criteria

1. Heatmap: weekday × hour; intensity = total active sessions.
2. Filterable by unit.
3. Date range up to 12 months.

## Tasks / Subtasks

- [ ] Task 1: Implement Peak-hours heatmap (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Heatmap: weekday × hour; intensity = total active sessions.
  - [ ] Satisfy AC#2: Filterable by unit.
  - [ ] Satisfy AC#3: Date range up to 12 months.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P2-E01. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
