# Story 17.5: Renewal / dunning state machine

Status: backlog

> Canonical ID: P2-E02-S05 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S05.md

## Story

As the system, I must charge the next period when the current ends, and handle failures gracefully.

## Acceptance Criteria

1. On `current_period_end`, job attempts to charge the next period from wallet.
2. Success → period rolls, entitlement reset.
3. Failure (insufficient wallet, auto-credit off) → `status='dunning'`; SMS-stub notifies parent; daily retry for 3 days.
4. After 3 days unpaid → `status='paused'` until manually resumed.
5. Auto-credit-enabled parents charge through to negative balance.

## Tasks / Subtasks

- [ ] Task 1: Implement Renewal / dunning state machine (AC: #1, #2, #3, #4, #5)
  - [ ] Satisfy AC#1: On `current_period_end`, job attempts to charge the next period from wallet.
  - [ ] Satisfy AC#2: Success → period rolls, entitlement reset.
  - [ ] Satisfy AC#3: Failure (insufficient wallet, auto-credit off) → `status='dunning'`; SMS-stub notifies parent; daily retry for 3 days.
  - [ ] Satisfy AC#4: After 3 days unpaid → `status='paused'` until manually resumed.
  - [ ] Satisfy AC#5: Auto-credit-enabled parents charge through to negative balance.
  - [ ] Touch / create: `apps/jobs/subscriptions/renew.ts`
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

`apps/jobs/subscriptions/renew.ts`. State transitions logged.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S02 - S04
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S05.md]
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
