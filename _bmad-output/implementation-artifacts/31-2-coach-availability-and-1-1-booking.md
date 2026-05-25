# Story 31.2: Coach availability and 1:1 booking

Status: backlog

> Canonical ID: P5-E01-S02 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E01-S02.md

## Story

As parent,
I want to book a 1:1 session with a specific coach at a time that works,
so that the capability described above is delivered.

## Acceptance Criteria

1. Coach availability defined as in P3-E03-S01.
2. Parent selects offering → coach → date → time.
3. 1:1 sessions hold the slot privately (capacity=1).
4. Payment via wallet or direct (M-Pesa / Paystack).
5. SMS-stub confirmation; reminder day-before; loyalty earns on settle.

## Tasks / Subtasks

- [ ] Task 1: Implement Coach availability and 1:1 booking (AC: #1, #2, #3, #4, #5)
  - [ ] Satisfy AC#1: Coach availability defined as in P3-E03-S01.
  - [ ] Satisfy AC#2: Parent selects offering → coach → date → time.
  - [ ] Satisfy AC#3: 1:1 sessions hold the slot privately (capacity=1).
  - [ ] Satisfy AC#4: Payment via wallet or direct (M-Pesa / Paystack).
  - [ ] Satisfy AC#5: SMS-stub confirmation; reminder day-before; loyalty earns on settle.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P2-E01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E01-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E01.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
