# Story 17.3: Bookings deduct subscription entitlement first

Status: backlog

> Canonical ID: P2-E02-S03 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S03.md

## Story

As a parent on a subscription, my bookings should consume entitlement, not wallet.

## Acceptance Criteria

1. When booking a service, if parent has active subscription matching service + child + period, entitlement decrements by 1; no wallet charge.
2. If entitlement is exhausted, fall back to wallet pay-as-you-go.
3. Booking row records `paid_via='subscription'` or `paid_via='wallet'`.

## Tasks / Subtasks

- [ ] Task 1: Implement Bookings deduct subscription entitlement first (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: When booking a service, if parent has active subscription matching service + child + period, entitlement decrements by 1; no wallet charge.
  - [ ] Satisfy AC#2: If entitlement is exhausted, fall back to wallet pay-as-you-go.
  - [ ] Satisfy AC#3: Booking row records `paid_via='subscription'` or `paid_via='wallet'`.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S02 - P2-E01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E02.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
