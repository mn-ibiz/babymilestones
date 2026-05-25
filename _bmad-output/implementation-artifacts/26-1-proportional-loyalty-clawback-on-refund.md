# Story 26.1: Proportional loyalty clawback on refund

Status: backlog

> Canonical ID: P3-E04-S01 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S01.md

## Story

As the system, when a refund happens, I must claw back the points that were earned on the refunded amount.

## Acceptance Criteria

1. When `wallet_ledger.kind='refund'` posts, compute the points that were earned on the original transaction (use `earn_rate` snapshot from that day).
2. Insert a `loyalty_ledger` debit with the proportional clawback amount and `reverses_loyalty_ledger_id` FK.
3. If the parent's points balance is sufficient → straightforward debit.
4. If insufficient → balance goes negative; flag `negative_carry=true` on the entry.
5. Decision refs: 22.

## Tasks / Subtasks

- [ ] Task 1: Implement Proportional loyalty clawback on refund (AC: #1, #2, #3, #4, #5)
  - [ ] Satisfy AC#1: When `wallet_ledger.kind='refund'` posts, compute the points that were earned on the original transaction (use `earn_rate` snapshot from that day).
  - [ ] Satisfy AC#2: Insert a `loyalty_ledger` debit with the proportional clawback amount and `reverses_loyalty_ledger_id` FK.
  - [ ] Satisfy AC#3: If the parent's points balance is sufficient → straightforward debit.
  - [ ] Satisfy AC#4: If insufficient → balance goes negative; flag `negative_carry=true` on the entry.
  - [ ] Satisfy AC#5: Decision refs: 22.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P2-E05-S01 - P1-E03-S06
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E04.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
