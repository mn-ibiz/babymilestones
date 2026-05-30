# Story 30.4: Free events (RSVP only)

Status: done

> Canonical ID: P4-E05-S04 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S04.md

## Story

As admin, I want some events to be free RSVP for capacity tracking only.

## Acceptance Criteria

1. Tier with `price_cents=0` → no payment, just RSVP.
2. RSVP collects same info as ticket purchase minus payment.
3. SMS-stub confirmation sent.

## Tasks / Subtasks

- [ ] Task 1: Implement Free events (RSVP only) (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Tier with `price_cents=0` → no payment, just RSVP.
  - [ ] Satisfy AC#2: RSVP collects same info as ticket purchase minus payment.
  - [ ] Satisfy AC#3: SMS-stub confirmation sent.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P4-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
