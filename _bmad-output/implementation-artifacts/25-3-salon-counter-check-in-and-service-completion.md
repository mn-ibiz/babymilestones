# Story 25.3: Salon counter check-in and service completion

Status: backlog

> Canonical ID: P3-E03-S03 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S03.md

## Story

As Reception, I want to check the child in and mark the service complete.

## Acceptance Criteria

1. Salon view shows today's bookings by stylist, by hour.
2. Tap booking → check in → wallet debit (P1-E03-S05) + commission line (P3-E01-S02).
3. Mark complete → photo capture optional (subject to consent), feedback prompt triggered (P5-E04).
4. Walk-in: receptionist creates parent (P1-E02-S02) → books a slot now → checks in.

## Tasks / Subtasks

- [ ] Task 1: Implement Salon counter check-in and service completion (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Salon view shows today's bookings by stylist, by hour.
  - [ ] Satisfy AC#2: Tap booking → check in → wallet debit (P1-E03-S05) + commission line (P3-E01-S02).
  - [ ] Satisfy AC#3: Mark complete → photo capture optional (subject to consent), feedback prompt triggered (P5-E04).
  - [ ] Satisfy AC#4: Walk-in: receptionist creates parent (P1-E02-S02) → books a slot now → checks in.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S02 - P1-E03 - P3-E01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E03.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
