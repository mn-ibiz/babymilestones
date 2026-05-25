# Story 17.4: Pause/freeze and resume a subscription

Status: backlog

> Canonical ID: P2-E02-S04 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S04.md

## Story

As parent,
I want to pause my subscription when we travel and resume later — without losing what I paid for,
so that the capability described above is delivered.

## Acceptance Criteria

1. Pause from parent dashboard or by admin/Reception; `status='paused'`; entitlement remaining frozen.
2. While paused: no new period charges, bookings forbidden under the plan, wallet pay-as-you-go still works.
3. Resume restores `status='active'`; period dates shifted by the pause duration; entitlement carries over.
4. Audit logged at pause and resume.

## Tasks / Subtasks

- [ ] Task 1: Implement Pause/freeze and resume a subscription (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Pause from parent dashboard or by admin/Reception; `status='paused'`; entitlement remaining frozen.
  - [ ] Satisfy AC#2: While paused: no new period charges, bookings forbidden under the plan, wallet pay-as-you-go still works.
  - [ ] Satisfy AC#3: Resume restores `status='active'`; period dates shifted by the pause duration; entitlement carries over.
  - [ ] Satisfy AC#4: Audit logged at pause and resume.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Carryover behaviour locked by Decision 3. `subscriptions.pause_history` JSONB.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S02.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S04.md]
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
