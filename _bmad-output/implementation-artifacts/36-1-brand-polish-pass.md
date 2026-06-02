# Story 36.1: Brand polish pass

Status: done

> Canonical ID: P5-E06-S01 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E06-S01.md

## Story

As marketing, I want the public site to look as good as the product feels.

## Acceptance Criteria

1. Photography swap (real children, real moments); design system tokens applied uniformly.
2. Typography refined; weight + scale aligned with brand guidelines.
3. All animations capped at 200ms; no jank.

## Tasks / Subtasks

- [ ] Task 1: Implement Brand polish pass (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Photography swap (real children, real moments); design system tokens applied uniformly.
  - [ ] Satisfy AC#2: Typography refined; weight + scale aligned with brand guidelines.
  - [ ] Satisfy AC#3: All animations capped at 200ms; no jank.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): Brand guidelines.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E06-S01.md]
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
