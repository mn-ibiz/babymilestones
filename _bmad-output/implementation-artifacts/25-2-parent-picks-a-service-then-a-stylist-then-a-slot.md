# Story 25.2: Parent picks a service, then a stylist, then a slot

Status: backlog

> Canonical ID: P3-E03-S02 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S02.md

## Story

As parent,
I want to book a salon visit with a stylist I trust,
so that the capability described above is delivered.

## Acceptance Criteria

1. Booking flow: service → stylist (optional, default "Any available") → date → available slots.
2. If parent picks a stylist, only that stylist's slots show.
3. If "Any available" — system picks the least-busy stylist on confirmation.
4. Confirm → booking, attribution captured, pending invoice created.

## Tasks / Subtasks

- [ ] Task 1: Implement Parent picks a service, then a stylist, then a slot (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Booking flow: service → stylist (optional, default "Any available") → date → available slots.
  - [ ] Satisfy AC#2: If parent picks a stylist, only that stylist's slots show.
  - [ ] Satisfy AC#3: If "Any available" — system picks the least-busy stylist on confirmation.
  - [ ] Satisfy AC#4: Confirm → booking, attribution captured, pending invoice created.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P2-E01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S02.md]
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
