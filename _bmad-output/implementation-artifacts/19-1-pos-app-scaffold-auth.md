# Story 19.1: POS app scaffold + auth

Status: backlog

> Canonical ID: P2-E04-S01 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S01.md

## Story

As cashier,
I want a POS app that I log into and start selling,
so that the capability described above is delivered.

## Acceptance Criteria

1. `apps/pos` Next.js app on `pos.babymilestones.co.ke`.
2. SSO from P1-E01-S04; role `cashier` lands directly on the sale screen.
3. Tablet-first layout, landscape ≥ 768px, large touch targets.

## Tasks / Subtasks

- [ ] Task 1: Implement POS app scaffold + auth (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: `apps/pos` Next.js app on `pos.babymilestones.co.ke`.
  - [ ] Satisfy AC#2: SSO from P1-E01-S04; role `cashier` lands directly on the sale screen.
  - [ ] Satisfy AC#3: Tablet-first layout, landscape ≥ 768px, large touch targets.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E04.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
