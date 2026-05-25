# Story 29.7: Sync scheduler + dead-letter for WooCommerce calls

Status: backlog

> Canonical ID: P4-E04-S07 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S07.md

## Story

As shop ops, I want orders and stock to stay in sync with WooCommerce automatically, with failures surfaced for handling — not silently dropped.

## Acceptance Criteria

1. A job in `apps/jobs` runs every N minutes (configurable, default 2 min) and pulls new/updated WooCommerce orders via `listOrders({ since: last_sync_at })`, upserting them into local `wc_orders`. `since` is checkpointed.
2. An outbox table `wc_outbox` holds pending writebacks (order status updates from S02, stock pushes from S05). A worker drains it FIFO with bounded concurrency.
3. Retry policy:
  - Network / 5xx / 429: exponential backoff (1m, 5m, 30m, 2h, 6h) up to 5 attempts, then dead-letter.
  - 4xx (except 429): one retry, then dead-letter.
4. Dead-letter table `wc_outbox_dead` retains the request + last error + timestamps. Admin UI lists dead-letter items with: replay, mark resolved, discard actions.
5. Sync health surfaced in admin: last successful pull timestamp, queue depth, dead-letter count, last 10 errors. A red banner shows if last pull is > 15 min ago.
6. All sync activity logs structured events; pull and writeback operations are audited at the summary level (counts, not per-item).
7. Manual "Sync now" button (admin-only) triggers an immediate pull.

## Tasks / Subtasks

- [ ] Task 1: Implement Sync scheduler + dead-letter for WooCommerce calls (AC: #1, #2, #3, #4, #5, #6, #7)
  - [ ] Satisfy AC#1: A job in `apps/jobs` runs every N minutes (configurable, default 2 min) and pulls new/updated WooCommerce orders via `listOrders({ since: last_sync_at })`, upserting them into local `wc_orders`. `since` is checkpointed.
  - [ ] Satisfy AC#2: An outbox table `wc_outbox` holds pending writebacks (order status updates from S02, stock pushes from S05). A worker drains it FIFO with bounded concurrency.
  - [ ] Satisfy AC#3: Retry policy:
  - [ ] Satisfy AC#4: Dead-letter table `wc_outbox_dead` retains the request + last error + timestamps. Admin UI lists dead-letter items with: replay, mark resolved, discard actions.
  - [ ] Satisfy AC#5: Sync health surfaced in admin: last successful pull timestamp, queue depth, dead-letter count, last 10 errors. A red banner shows if last pull is > 15 min ago.
  - [ ] Satisfy AC#6: All sync activity logs structured events; pull and writeback operations are audited at the summary level (counts, not per-item).
  - [ ] Satisfy AC#7: Manual "Sync now" button (admin-only) triggers an immediate pull.
- [ ] Task 2: Tests (AC: all)
  - Integration: pull cycle picks up only orders newer than checkpoint; idempotent on re-run.
  - Integration: writeback retries on 5xx, dead-letters on persistent 4xx, replay from dead-letter works.
  - Unit: backoff schedule produces correct delays.

## Dev Notes

- Uses the jobs framework from P3-E06-S01.
- Idempotency: `wc_outbox` rows carry an `idempotency_key`; the Woo client is called with it where applicable (or the worker checks current Woo state before retrying mutations that may have partially succeeded).
- Concurrency: limit Woo API calls to N parallel (configurable, default 4) to respect rate limits.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S06 (REST client) - P3-E06-S01 (jobs framework) - P1-E10-S04 (admin Settings / health surface)
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S07.md]
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
