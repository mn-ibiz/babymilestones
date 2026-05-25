# Story 32.4: VAT registration metadata

Status: backlog

> Canonical ID: P5-E02-S04 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S04.md

## Story

As admin, I want to record the company PIN and VAT registration once.

## Acceptance Criteria

1. Settings → Tax → fields: PIN, VAT registration number, registered address.
2. Receipt renderer (PDF + thermal) shows these in the footer block.

## Tasks / Subtasks

- [ ] Task 1: Implement VAT registration metadata (AC: #1, #2)
  - [ ] Satisfy AC#1: Settings → Tax → fields: PIN, VAT registration number, registered address.
  - [ ] Satisfy AC#2: Receipt renderer (PDF + thermal) shows these in the footer block.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E02.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
