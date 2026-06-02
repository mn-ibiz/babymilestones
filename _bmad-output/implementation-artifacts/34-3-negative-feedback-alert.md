# Story 34.3: Negative feedback alert

Status: review

> Canonical ID: P5-E04-S03 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E04-S03.md

## Story

As admin, I want to know immediately when a rating ≤ 2 lands.

## Acceptance Criteria

1. New feedback ≤ 2 → in-app alert + SMS to admin within 5 minutes.
2. Alert links to the feedback detail.

## Tasks / Subtasks

- [ ] Task 1: Implement Negative feedback alert (AC: #1, #2)
  - [ ] Satisfy AC#1: New feedback ≤ 2 → in-app alert + SMS to admin within 5 minutes.
  - [ ] Satisfy AC#2: Alert links to the feedback detail.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E04-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E04.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
