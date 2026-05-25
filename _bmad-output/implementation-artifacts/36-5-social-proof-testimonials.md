# Story 36.5: Social proof + testimonials

Status: backlog

> Canonical ID: P5-E06-S05 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E06-S05.md

## Story

As marketing, I want curated feedback (P5-E04-S04) visible on the home page.

## Acceptance Criteria

1. Auto-pulls latest 3 published reviews from P5-E04-S04.
2. Caches; updates within 1h of curation.

## Tasks / Subtasks

- [ ] Task 1: Implement Social proof + testimonials (AC: #1, #2)
  - [ ] Satisfy AC#1: Auto-pulls latest 3 published reviews from P5-E04-S04.
  - [ ] Satisfy AC#2: Caches; updates within 1h of curation.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P5-E04-S04. --- *End of P5 stories. End of phased backlog.*
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E06-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E06.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
