# Story 19.5: End-of-day cash-up

Status: backlog

> Canonical ID: P2-E04-S05 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S05.md

## Story

As cashier,
I want to close the till at end-of-day and report any variance,
so that the capability described above is delivered.

## Acceptance Criteria

1. "End of day" CTA shows: expected cash (sum of cash sales), expected M-Pesa, expected Paystack.
2. Cashier enters actual cash counted; variance computed.
3. Variance > KES 500 → reason text required.
4. Audit + writes to Treasury reconciliation feed (P1-E06).

## Tasks / Subtasks

- [ ] Task 1: Implement End-of-day cash-up (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: "End of day" CTA shows: expected cash (sum of cash sales), expected M-Pesa, expected Paystack.
  - [ ] Satisfy AC#2: Cashier enters actual cash counted; variance computed.
  - [ ] Satisfy AC#3: Variance > KES 500 → reason text required.
  - [ ] Satisfy AC#4: Audit + writes to Treasury reconciliation feed (P1-E06).
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S04 - P1-E06. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S05.md]
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
