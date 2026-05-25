# Story 29.2: Order status transitions sync back to WooCommerce

Status: backlog

> Canonical ID: P4-E04-S02 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S02.md

## Story

As shop staff, I want to advance an order's status as I work it, and have WooCommerce reflect the change so the customer sees it.

## Acceptance Criteria

1. Tap → action sheet: "Start packing", "Mark ready", "Mark dispatched", "Mark fulfilled", "Cancel".
2. Each transition writes to local `order_events` (audit-grade) and enqueues a Woo writeback via the sync layer.
3. Local → Woo status mapping (configurable, defaults):
  - `packing` → Woo `processing`
  - `ready` → Woo `processing` (note added)
  - `dispatched` → Woo `completed` (with tracking note)
  - `fulfilled` → Woo `completed`
  - `cancelled` → Woo `cancelled`
4. Cannot skip statuses; reversing requires admin role.
5. Dispatched state captures: rider/courier name, vehicle/contact, time — appended as a Woo order note.
6. If Woo writeback fails, the local transition still stands; the writeback is retried by the sync scheduler (S07) and surfaced in a dead-letter view if it permanently fails.

## Tasks / Subtasks

- [ ] Task 1: Implement Order status transitions sync back to WooCommerce (AC: #1, #2, #3, #4, #5, #6)
  - [ ] Satisfy AC#1: Tap → action sheet: "Start packing", "Mark ready", "Mark dispatched", "Mark fulfilled", "Cancel".
  - [ ] Satisfy AC#2: Each transition writes to local `order_events` (audit-grade) and enqueues a Woo writeback via the sync layer.
  - [ ] Satisfy AC#3: Local → Woo status mapping (configurable, defaults):
  - [ ] Satisfy AC#4: Cannot skip statuses; reversing requires admin role.
  - [ ] Satisfy AC#5: Dispatched state captures: rider/courier name, vehicle/contact, time — appended as a Woo order note.
  - [ ] Satisfy AC#6: If Woo writeback fails, the local transition still stands; the writeback is retried by the sync scheduler (S07) and surfaced in a dead-letter view if it permanently fails.
- [ ] Task 2: Tests (AC: all)
  - Unit: status machine rejects invalid transitions; admin role required for reversal.
  - Integration: a successful transition enqueues a writeback row; on Woo 5xx, retry; on 4xx, dead-letter.

## Dev Notes

- Customer-facing notifications come from WooCommerce's own email/SMS flows (Woo plugin handles this). The custom system does **not** trigger SMS for online orders — only for in-store transactions. This is a deliberate scope cut from the original SMS-trigger AC.
- Writebacks are idempotent: keyed by (woo_order_id, local_status, attempt_id).

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - S06 (REST client) - S07 (sync scheduler + dead-letter)
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E04-S02.md]
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
