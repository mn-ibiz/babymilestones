# Story 29.4: Daily dispatch report

Status: backlog

> Canonical ID: P4-E04-S04 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S04.md

## Story

As shop ops, I want an end-of-day summary of online orders dispatched and still pending.

## Acceptance Criteria

1. Report covers WooCommerce-originated orders only (in-store POS sales have their own end-of-day in P2-E04-S05).
2. Counts by `local_status`, total value (KES), average pack time (new → ready), average dispatch time (ready → dispatched).
3. CSV export.
4. Date filter; defaults to today.
5. Includes a "Sync health" row: orders with stuck/failed Woo writebacks in the dead-letter (link to S07 view).

## Tasks / Subtasks

- [ ] Task 1: Implement Daily dispatch report (AC: #1, #2, #3, #4, #5)
  - [ ] Satisfy AC#1: Report covers WooCommerce-originated orders only (in-store POS sales have their own end-of-day in P2-E04-S05).
  - [ ] Satisfy AC#2: Counts by `local_status`, total value (KES), average pack time (new → ready), average dispatch time (ready → dispatched).
  - [ ] Satisfy AC#3: CSV export.
  - [ ] Satisfy AC#4: Date filter; defaults to today.
  - [ ] Satisfy AC#5: Includes a "Sync health" row: orders with stuck/failed Woo writebacks in the dead-letter (link to S07 view).
- [ ] Task 2: Tests (AC: all)
  - Unit: pack-time and dispatch-time calculations across edge cases (cancelled mid-flight, manually-reversed transitions).

## Dev Notes

- Reads from `wc_orders` + `order_events`. No live Woo call.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S02
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P4-E04.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
