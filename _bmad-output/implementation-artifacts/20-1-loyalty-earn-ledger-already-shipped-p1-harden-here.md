# Story 20.1: Loyalty earn ledger (already shipped P1, harden here)

Status: backlog

> Canonical ID: P2-E05-S01 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S01.md

## Story

As developer,
I want loyalty earnings to be auditable and reconcilable,
so that the capability described above is delivered.

## Acceptance Criteria

1. `loyalty_ledger` rows for every settled payment per Decision 21.
2. Each row references the `wallet_ledger` entry that triggered it.
3. Earn-rate snapshot stored on the row to survive future rate changes.

## Tasks / Subtasks

- [ ] Task 1: Implement Loyalty earn ledger (already shipped P1, harden here) (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: `loyalty_ledger` rows for every settled payment per Decision 21.
  - [ ] Satisfy AC#2: Each row references the `wallet_ledger` entry that triggered it.
  - [ ] Satisfy AC#3: Earn-rate snapshot stored on the row to survive future rate changes.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Tidy up the earn path written in P1.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1 loyalty plumbing.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S01.md]
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
