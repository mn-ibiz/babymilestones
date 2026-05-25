# Story 23.2: Commission line recorded on every attributed booking

Status: backlog

> Canonical ID: P3-E01-S02 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S02.md

## Story

As accountant, I want every salon visit to write a commission line for traceability.

## Acceptance Criteria

1. On booking settle (wallet debit or subscription consumption), if `attributed_staff_id IS NOT NULL`, insert a `commission_ledger` row: staff_id, booking_id, amount_cents, rate_snapshot, source.
2. Refunds reverse the commission via reversing entry.
3. Commission amount = service price × rate at booking time.
4. Ledger is append-only.

## Tasks / Subtasks

- [ ] Task 1: Implement Commission line recorded on every attributed booking (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: On booking settle (wallet debit or subscription consumption), if `attributed_staff_id IS NOT NULL`, insert a `commission_ledger` row: staff_id, booking_id, amount_cents, rate_snapshot, source.
  - [ ] Satisfy AC#2: Refunds reverse the commission via reversing entry.
  - [ ] Satisfy AC#3: Commission amount = service price × rate at booking time.
  - [ ] Satisfy AC#4: Ledger is append-only.
  - [ ] Touch / create: `packages/wallet/commission-hook.ts`
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Hooks into wallet debit completion. `packages/wallet/commission-hook.ts`.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E03 - P1-E07
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E01.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
