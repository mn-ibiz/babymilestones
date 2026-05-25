# Story 33.4: Template editor (admin)

Status: backlog

> Canonical ID: P5-E03-S04 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S04.md

## Story

As admin, I want to edit SMS bodies without code changes.

## Acceptance Criteria

1. Settings → SMS Templates → list + edit.
2. Placeholder validation: missing `{name}` etc. flagged.
3. New version on save; old versions retained.

## Tasks / Subtasks

- [ ] Task 1: Implement Template editor (admin) (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Settings → SMS Templates → list + edit.
  - [ ] Satisfy AC#2: Placeholder validation: missing `{name}` etc. flagged.
  - [ ] Satisfy AC#3: New version on save; old versions retained.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E09-S03. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E03.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
