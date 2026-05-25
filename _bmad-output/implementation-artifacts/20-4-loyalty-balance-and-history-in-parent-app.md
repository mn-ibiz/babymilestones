# Story 20.4: Loyalty balance and history in parent app

Status: backlog

> Canonical ID: P2-E05-S04 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S04.md

## Story

As parent,
I want to see my points balance and how I earned them,
so that the capability described above is delivered.

## Acceptance Criteria

1. Parent dashboard shows points balance + lifetime earned + lifetime redeemed.
2. History view: earn/redeem entries with source link (booking, top-up, etc.).
3. Decision refs: 11.

## Tasks / Subtasks

- [ ] Task 1: Implement Loyalty balance and history in parent app (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Parent dashboard shows points balance + lifetime earned + lifetime redeemed.
  - [ ] Satisfy AC#2: History view: earn/redeem entries with source link (booking, top-up, etc.).
  - [ ] Satisfy AC#3: Decision refs: 11.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - S03 - P1-E11. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S04.md]
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
