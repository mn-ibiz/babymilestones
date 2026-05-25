# Story 17.1: Subscription plan catalogue

Status: backlog

> Canonical ID: P2-E02-S01 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S01.md

## Story

As admin, I want to define subscription plans like "8 Play sessions per month" with price and entitlement.

## Acceptance Criteria

1. `subscription_plans` table: name, service_id, entitlement_count, period (`week`|`month`|`term`), price, is_active.
2. CRUD with audit.
3. Plan price changes are effective-dated like services.

## Tasks / Subtasks

- [ ] Task 1: Implement Subscription plan catalogue (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: `subscription_plans` table: name, service_id, entitlement_count, period (`week`|`month`|`term`), price, is_active.
  - [ ] Satisfy AC#2: CRUD with audit.
  - [ ] Satisfy AC#3: Plan price changes are effective-dated like services.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E07.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S01.md]
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
