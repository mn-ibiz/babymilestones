# Story 36.2: SEO + performance budget tightening

Status: backlog

> Canonical ID: P5-E06-S02 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E06-S02.md

## Story

As marketing, I want the site to rank and load fast.

## Acceptance Criteria

1. Lighthouse 95+ on Performance, SEO, Accessibility.
2. All public pages: meta tags, Open Graph, structured data (LocalBusiness).
3. LCP < 1.5s on 3G fast.

## Tasks / Subtasks

- [ ] Task 1: Implement SEO + performance budget tightening (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Lighthouse 95+ on Performance, SEO, Accessibility.
  - [ ] Satisfy AC#2: All public pages: meta tags, Open Graph, structured data (LocalBusiness).
  - [ ] Satisfy AC#3: LCP < 1.5s on 3G fast.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E06-S02.md]
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
