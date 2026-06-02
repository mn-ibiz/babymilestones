# Story 29.7: Sync scheduler + dead-letter for WooCommerce calls

Status: done

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

- [x] Task 1: Implement Sync scheduler + dead-letter for WooCommerce calls (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] Satisfy AC#1: A job in `apps/jobs` runs every N minutes (configurable, default 2 min) and pulls new/updated WooCommerce orders via `listOrders({ since: last_sync_at })`, upserting them into local `wc_orders`. `since` is checkpointed.
  - [x] Satisfy AC#2: An outbox table `wc_outbox` holds pending writebacks (order status updates from S02, stock pushes from S05). A worker drains it FIFO with bounded concurrency.
  - [x] Satisfy AC#3: Retry policy: network/5xx/429 → exponential backoff [1m,5m,30m,2h,6h] up to 5 attempts then dead-letter; 4xx (except 429) → one retry then dead-letter.
  - [x] Satisfy AC#4: Dead-letter table `wc_outbox_dead` retains the request + last error + timestamps. Admin UI lists dead-letter items with: replay, mark resolved, discard actions.
  - [x] Satisfy AC#5: Sync health surfaced in admin: last successful pull timestamp, queue depth, dead-letter count, last 10 errors. A red banner shows if last pull is > 15 min ago.
  - [x] Satisfy AC#6: All sync activity logs structured events; pull and writeback operations are audited at the summary level (counts, not per-item).
  - [x] Satisfy AC#7: Manual "Sync now" button (admin-only) triggers an immediate pull.
- [x] Task 2: Tests (AC: all)
  - [x] Integration: pull cycle picks up only orders newer than checkpoint; idempotent on re-run.
  - [x] Integration: writeback retries on 5xx, dead-letters on persistent 4xx, replay from dead-letter works.
  - [x] Unit: backoff schedule produces correct delays.

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

claude-opus-4-8

### Debug Log References

- `cd packages/woocommerce && pnpm vitest run` → 72 passed (6 files)
- `cd apps/jobs && pnpm vitest run` → 126 passed (21 files)
- `cd apps/api && pnpm vitest run` → 772 passed (84 files)
- `cd packages/auth && pnpm vitest run` → 82 passed (10 files)
- `cd packages/db && pnpm vitest run` → 43 passed (9 files)
- `cd packages/contracts && pnpm vitest run` → 193 passed (10 files)
- `cd apps/admin && pnpm vitest run` → 307 passed (55 files)
- `pnpm typecheck` → 18/18 packages successful

### Completion Notes List

- Migration `0092_woo_sync.sql` adds four additive tables: `wc_sync_state`
  (singleton checkpoint: `last_sync_at` + `last_pull_at`), `wc_orders` (local
  order projection, UNIQUE on `woo_order_id` for idempotent upsert), `wc_outbox`
  (pending writebacks, UNIQUE `idempotency_key`, FIFO drain index), and
  `wc_outbox_dead` (dead-lettered writebacks with replay/resolve/discard status).
- Sync state machine lives in `@bm/woocommerce` (`sync.ts`), mirroring the
  `@bm/payments` etims-queue pattern, so the pure backoff/transition logic is unit
  tested without a network or job runner. `retry.ts` classifies typed Woo errors
  into retryable (network/5xx/429) vs non-retryable (other 4xx). `health.ts`
  computes the AC5 snapshot incl. the 15-minute staleness flag.
- Backoff schedule (AC3): `WC_BACKOFF_MS = [1m,5m,30m,2h,6h]`, `WC_MAX_ATTEMPTS = 5`.
  Retryable failures climb the ladder up to 5 attempts then dead-letter;
  non-retryable (4xx except 429) get exactly one retry (`WC_NON_RETRYABLE_MAX_ATTEMPTS = 2`,
  due immediately) then dead-letter.
- Concurrency (AC2): the drain worker uses a bounded worker-pool (default 4,
  `concurrency` configurable); a test asserts `maxInFlight <= N` and `> 1`. FIFO is
  on `created_at` (stamped from the enqueue clock so same-tick inserts stay ordered).
- Idempotency: every `wc_outbox` row carries a stable `idempotency_key` (UNIQUE);
  `enqueueWcWriteback` is a no-op on conflict, and a retry re-uses the same row, so
  a mutation is never double-applied.
- Two jobs registered in `apps/jobs` (framework pattern, `createXJob(deps): Job`):
  `wc-sync-pull` (default `intervalMs` 120_000 / cron `*/2 * * * *`) and
  `wc-outbox-drain` (60s cadence). Both inject the Woo client + clock + logger; a
  `listOrders` throw propagates so the framework records the failed run (no
  checkpoint advance, no audit) — the failure surfaces, never silently dropped.
- Audit (AC6) at SUMMARY level only: the pull emits one `woocommerce.sync.pulled`
  row (count, not per-order); the drain emits one `woocommerce.writeback.processed`
  row (processed/retried/dead_lettered counts). Six new audit actions registered in
  `@bm/auth` under a `woocommerce` category (sync.pulled, writeback.processed,
  deadletter.replayed/resolved/discarded, sync.triggered).
- Admin API `apps/api/src/routes/admin/woocommerce-sync.ts` (all `manage config`):
  `GET .../health`, `GET .../dead-letters`, `POST .../dead-letters/:id/{replay,resolve,discard}`,
  `POST .../sync-now`. Sync-now triggers the registered `wc-sync-pull` job by name
  through the injected jobs registry (API never imports `apps/jobs`) and audits
  `woocommerce.sync.triggered`.
- Admin UI `apps/admin/app/woocommerce-sync/page.tsx`: health panel + red staleness
  banner (>15 min) + Sync-now button + dead-letter table with replay/resolve/discard.
- Boot wiring follows the established shim pattern: `registerWcSyncPullJob` /
  `registerWcOutboxDrainJob` exported from `apps/jobs/src/index.ts` for the deploy
  story to call with live infra (same as etims-retry / sms-retry).

### File List

- packages/db/migrations/0092_woo_sync.sql (new)
- packages/db/src/schema/wc-sync.ts (new)
- packages/db/src/schema/index.ts (modified)
- packages/contracts/src/woocommerce.ts (modified)
- packages/woocommerce/src/sync.ts (new)
- packages/woocommerce/src/sync.test.ts (new)
- packages/woocommerce/src/retry.ts (new)
- packages/woocommerce/src/retry.test.ts (new)
- packages/woocommerce/src/health.ts (new)
- packages/woocommerce/src/health.test.ts (new)
- packages/woocommerce/src/index.ts (modified)
- apps/jobs/src/jobs/wc-sync-pull.ts (new)
- apps/jobs/src/jobs/wc-sync-pull.test.ts (new)
- apps/jobs/src/jobs/wc-outbox-drain.ts (new)
- apps/jobs/src/jobs/wc-outbox-drain.test.ts (new)
- apps/jobs/src/index.ts (modified)
- apps/jobs/package.json (modified — add @bm/woocommerce dep)
- apps/api/src/routes/admin/woocommerce-sync.ts (new)
- apps/api/src/routes/admin/woocommerce-sync.test.ts (new)
- apps/api/src/routes/admin/index.ts (modified)
- apps/admin/app/woocommerce-sync/page.tsx (new)
- packages/auth/src/audit-actions.ts (modified — woocommerce audit category)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Implemented sync scheduler (wc-sync-pull, 2-min) + outbox drain (bounded concurrency 4) + dead-letter (replay/resolve/discard) + admin health/sync-now API & UI; migration 0092; summary-level audit; TDD across @bm/woocommerce/@bm/jobs/@bm/api. Status → review. | Amelia (dev-story) |

## Review Follow-ups (AI)

- [ ] [Med] Outbox claim (claimDueWcWritebacks) is a plain SELECT WHERE status='pending' with no FOR UPDATE SKIP LOCKED and no in-flight 'processing' status; safe under the documented single-worker model but a foot-gun under horizontal scaling, and `sync-now` calls pullJob.run() directly, bypassing the scheduler overlap guard. Add a durable claim (FOR UPDATE SKIP LOCKED + lease/processing status) or route sync-now through the overlap-guarded runJob. (Spot-check 2026-06-02; non-blocking single-worker.)
