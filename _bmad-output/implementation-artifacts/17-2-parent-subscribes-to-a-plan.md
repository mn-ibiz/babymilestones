# Story 17.2: Parent subscribes to a plan

Status: backlog

> Canonical ID: P2-E02-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S02.md

## Story

As parent,
I want to subscribe to a plan and pre-pay for the period,
so that the capability described above is delivered.

## Acceptance Criteria

1. From service page, "Subscribe" option lists eligible plans.
2. Subscription created; full period charged from wallet immediately.
3. `subscriptions` table: parent_id, child_id, plan_id, started_at, current_period_start, current_period_end, status (`active`|`paused`|`cancelled`), entitlement_remaining.
4. SMS-stub confirms; loyalty earns on the settled charge.

## Tasks / Subtasks

- [ ] Task 1: Implement Parent subscribes to a plan (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: From service page, "Subscribe" option lists eligible plans.
  - [ ] Satisfy AC#2: Subscription created; full period charged from wallet immediately.
  - [ ] Satisfy AC#3: `subscriptions` table: parent_id, child_id, plan_id, started_at, current_period_start, current_period_end, status (`active`|`paused`|`cancelled`), entitlement_remaining.
  - [ ] Satisfy AC#4: SMS-stub confirms; loyalty earns on the settled charge.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E03
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S02.md]
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
