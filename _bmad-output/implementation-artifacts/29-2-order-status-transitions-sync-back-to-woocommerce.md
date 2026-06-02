# Story 29.2: Order status transitions sync back to WooCommerce

Status: done

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

- [x] Task 1: Implement Order status transitions sync back to WooCommerce (AC: #1, #2, #3, #4, #5, #6)
  - [x] Satisfy AC#1: Tap → action sheet: "Start packing", "Mark ready", "Mark dispatched", "Mark fulfilled", "Cancel". (`OrderActionSheet` + `ORDER_TRANSITION_ACTIONS`)
  - [x] Satisfy AC#2: Each transition writes to local `order_events` (audit-grade) and enqueues a Woo writeback via the sync layer. (`applyOrderTransition` → `order_events` insert + `enqueueWcWriteback`)
  - [x] Satisfy AC#3: Local → Woo status mapping (configurable, defaults): packing→processing, ready→processing(+note), dispatched→completed(+tracking note), fulfilled→completed, cancelled→cancelled. (`WC_LOCAL_TO_WOO_DEFAULT` + `mapLocalToWoo` override)
  - [x] Satisfy AC#4: Cannot skip statuses; reversing requires admin role. (`classifyTransition` + `planTransition`; non-admin reversal → 403)
  - [x] Satisfy AC#5: Dispatched state captures: rider/courier name, vehicle/contact, time — appended as a Woo order note. (`DispatchDetail` → `order_events.metadata` + `buildDispatchNote`)
  - [x] Satisfy AC#6: If Woo writeback fails, the local transition still stands; the writeback is retried by the sync scheduler (S07) and surfaced in a dead-letter view if it permanently fails. (write path only ENQUEUES; 29.7 drain owns retry/dead-letter)
- [x] Task 2: Tests (AC: all)
  - [x] Unit: status machine rejects invalid transitions (skip/no-op/terminal); admin role required for reversal. (`order-transitions.test.ts` in `@bm/contracts`)
  - [x] Integration: a successful transition enqueues exactly one `wc_outbox` writeback row with the mapped status + idempotency key; Woo is never called synchronously (retry/dead-letter is exercised by the 29.7 drain suite, unchanged here). (`order-transitions.test.ts` in `@bm/woocommerce` + `@bm/api`)

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

claude-opus-4-8

### Debug Log References

- `@bm/contracts`: `pnpm vitest run` → 236 passed (12 files), incl. `order-transitions.test.ts` 24.
- `@bm/woocommerce`: `pnpm vitest run` → 89 passed (8 files), incl. `order-transitions.test.ts` 11.
- `@bm/db`: `pnpm vitest run` → 43 passed (9 files); migrate test applies new `0094`.
- `@bm/auth`: `pnpm vitest run` → 82 passed (10 files); audit-catalogue single-source test green.
- `@bm/api`: `pnpm vitest run` → 786 passed (86 files), incl. `routes/pos/order-transitions.test.ts` 10.
- `@bm/pos`: `pnpm vitest run` → 111 passed (15 files), incl. `OrderActionSheet.test.tsx` 5 + `lib/order-actions.test.ts` 10.
- Root `pnpm typecheck` → 18/18 packages clean. `pnpm lint` clean for every touched package.

### Completion Notes List

- State machine is PURE in `@bm/contracts` (`order-transitions.ts`): linear ladder `new→packing→ready→dispatched→fulfilled`; `cancel` from any non-terminal; reversal (any earlier status) is admin-only. `fulfilled`/`cancelled` terminal; `cancelled` is a hard dead-end (an admin may reverse out of `fulfilled` as a correction, but not out of `cancelled`).
- Local→Woo mapping defaults exactly per AC3, with a configurable override map. `ready` carries a standard note; `dispatched` carries the rider/vehicle/contact/time tracking note (AC5). Time is server-stamped at the API.
- Write path `applyOrderTransition` (`@bm/woocommerce`) runs in ONE transaction: update `wc_orders.local_status` + insert one `order_events` row + enqueue exactly one `wc_outbox` row (kind `order_status`). Woo is NEVER called synchronously — only enqueued — so a Woo outage never rolls back the local transition (AC6). Idempotency key: `wc-order:{wooOrderId}:{toStatus}:{attemptId}`.
- API `POST /pos/online-orders/:wooOrderId/transition`: base gate admits till roles (`read product`) OR admins; the write path enforces the admin-only reversal (a till staffer reversing → 403). Audited as `woocommerce.order.transition` (forward/cancel) or `woocommerce.order.transition_reversed` (reversal). No SMS for online orders (scope cut — Woo owns customer notifications).
- POS UI: `OrderActionSheet` shows all five actions; illegal/forbidden actions disabled per current status + role (`orderActionStates`); `Mark dispatched` opens an inline rider/courier capture (AC5). Wired into the `OnlineOrders` card with a post-transition queue refresh.
- 29.7 drain (`apps/jobs`) already dispatches `order_status` rows → no jobs change; retry/dead-letter NOT re-implemented (29.7 owns it).
- Migration `0094_order_events.sql` (additive): `order_events` table with from/to status CHECKs mirroring `wc_orders.local_status`, actor, kind, outbox key, jsonb metadata, indexed by `(woo_order_id, created_at DESC)`.
- New audit actions registered in `packages/auth/src/audit-actions.ts` under `woocommerce`: `woocommerce.order.transition`, `woocommerce.order.transition_reversed`.

### File List

Created:
- `packages/db/migrations/0094_order_events.sql`
- `packages/contracts/src/order-transitions.ts`
- `packages/contracts/src/order-transitions.test.ts`
- `packages/woocommerce/src/order-transitions.ts`
- `packages/woocommerce/src/order-transitions.test.ts`
- `apps/api/src/routes/pos/order-transitions.ts`
- `apps/api/src/routes/pos/order-transitions.test.ts`
- `apps/pos/lib/order-actions.ts`
- `apps/pos/lib/order-actions.test.ts`
- `apps/pos/lib/order-transitions-api.ts`
- `apps/pos/app/components/OrderActionSheet.tsx`
- `apps/pos/app/components/OrderActionSheet.test.tsx`

Modified:
- `packages/db/src/schema/wc-sync.ts` (added `order_events` table + `OrderEventKind`/`OrderEventRow`/`OrderEventInsert`)
- `packages/contracts/src/index.ts` (export `order-transitions`)
- `packages/woocommerce/src/index.ts` (export `applyOrderTransition`, `transitionOutboxKey`, types)
- `packages/auth/src/audit-actions.ts` (two new `woocommerce.order.*` actions)
- `apps/api/src/routes/pos/index.ts` (register the transition route)
- `apps/pos/app/components/OnlineOrders.tsx` (render the action sheet per card + `canReverse` prop + refresh)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Implemented order-status transitions + Woo writeback enqueue (state machine, mapping, write path, API, POS action sheet, migration 0094, audit actions) | Amelia (dev-story) |

## Review Follow-ups (AI)

- [ ] [Med] Order-status writeback applies an idempotent status PUT followed by a NON-idempotent addOrderNote POST; on a retryable failure after the PUT, the retry re-POSTs the note → duplicate notes on the Woo order (up to 5x). Make the note write idempotent (dedupe by content/marker) or split status + note into separately-acked outbox steps. (Spot-check 2026-06-02; non-blocking single-worker.)
