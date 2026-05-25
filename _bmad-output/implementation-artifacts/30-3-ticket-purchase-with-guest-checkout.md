# Story 30.3: Ticket purchase with guest checkout

Status: backlog

> Canonical ID: P4-E05-S03 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S03.md

## Story

As grandparent (no account),
I want to buy a recital ticket without registering,
so that the capability described above is delivered.

## Acceptance Criteria

1. Buy flow: quantity → buyer name + phone (+ optional email for e-ticket) → pay (M-Pesa or Paystack).
2. Tickets issued with unique codes; e-ticket SMS-stub link.
3. If buyer is a signed-in parent, prefilled.
4. Decision refs: 28.

## Tasks / Subtasks

- [ ] Task 1: Implement Ticket purchase with guest checkout (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Buy flow: quantity → buyer name + phone (+ optional email for e-ticket) → pay (M-Pesa or Paystack).
  - [ ] Satisfy AC#2: Tickets issued with unique codes; e-ticket SMS-stub link.
  - [ ] Satisfy AC#3: If buyer is a signed-in parent, prefilled.
  - [ ] Satisfy AC#4: Decision refs: 28.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E04
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S03.md]
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
