# Story 20.3: Redemption at parent checkout

Status: backlog

> Canonical ID: P2-E05-S03 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S03.md

## Story

As parent,
I want to use my points to reduce my booking or shop bill,
so that the capability described above is delivered.

## Acceptance Criteria

1. At booking confirmation (in the custom platform), a toggle: "Use X points (save KES Y)". (WooCommerce online purchases are out of scope for loyalty — Decision 37.)
2. Toggle on → applies points as a wallet credit equal to `points × redeem_rate`, deducts from the bill.
3. Cannot redeem more points than current balance; cannot redeem points already on a pending settlement.
4. Redemption writes a `loyalty_ledger` debit + a `wallet_ledger` credit + the booking debit applies normally.

## Tasks / Subtasks

- [ ] Task 1: Implement Redemption at parent checkout (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: At booking confirmation (in the custom platform), a toggle: "Use X points (save KES Y)". (WooCommerce online purchases are out of scope for loyalty — Decision 37.)
  - [ ] Satisfy AC#2: Toggle on → applies points as a wallet credit equal to `points × redeem_rate`, deducts from the bill.
  - [ ] Satisfy AC#3: Cannot redeem more points than current balance; cannot redeem points already on a pending settlement.
  - [ ] Satisfy AC#4: Redemption writes a `loyalty_ledger` debit + a `wallet_ledger` credit + the booking debit applies normally.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P2-E01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
