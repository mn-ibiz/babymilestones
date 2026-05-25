# Story 4.3: STK reconciliation cron

Status: done

> Canonical ID: P1-E04-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S03.md

## Story

As the system,
I want to recover from missing M-Pesa callbacks within 2 minutes,
so that parents are credited (or failed) reliably even when Daraja never calls back.

## Acceptance Criteria

1. Cron in `apps/jobs` runs every 60s.
2. For each `mpesa_stk_request` in `CALLBACK_PENDING` older than 90s, calls Daraja `stkpushquery`.
3. If query returns success → process as if callback arrived (use the same idempotent path).
4. If query returns failure → mark `FAILED`, notify parent via SMS-stub.
5. Stale requests (>15 min, still pending) → marked `EXPIRED`.

## Tasks / Subtasks

- [x] Task 1: Add `stkpushquery` to the M-Pesa adapter (AC: #2)
  - [x] Added `stkQuery` to the existing injected-transport mpesa adapter (`packages/payments/src/mpesa/stkPush.ts`), exported `StkQueryInput`/`StkQueryResult`; credentials from config (env in API layer), no real network in tests. (Method lives on the existing adapter rather than a separate `stkQuery.ts` file so it shares the token/timestamp/transport plumbing.)
- [x] Task 2: Register reconciliation job in `apps/jobs` (AC: #1)
  - [x] `apps/jobs/src/jobs/mpesa-reconcile.ts` + `registerMpesaReconcileJob` wiring; `Job` gains `intervalMs`, set to 60_000 (60s cadence).
- [x] Task 3: Query pending requests and reconcile (AC: #2, #3)
  - [x] Selects pending rows (`STK_SENT`/`CALLBACK_PENDING`) with `updatedAt` older than 90s; calls `stkQuery`.
  - [x] On success, credits via the SAME idempotent path as S02: insert `mpesa_callback` `ON CONFLICT DO NOTHING`, credit with idempotency key = `mpesa_callback.id` (re-using the existing id on conflict), then SUCCEEDED. Test proves no double-credit when S02 already credited.
- [x] Task 4: Failure + expiry handling (AC: #4, #5)
  - [x] On query failure → `FAILED`, `@bm/sms` `StubSmsSender` notification, audit `payment.mpesa.reconcile.failed`.
  - [x] Pending >15 min → `EXPIRED` (no Daraja call); additive migration 0019 widens the state CHECK constraint; audit `payment.mpesa.reconcile.expired`.
- [x] Task 5: Tests (AC: all)
  - [x] vitest (test-first, PGlite `createTestDb`): success reuses idempotent path (no double credit, exactly one ledger row); failure → `FAILED` + SMS-stub + audit; >15 min → `EXPIRED`; job only picks up rows older than 90s; pending rows left untouched. Adapter unit tests for success/failed/pending/transport-error mapping.

## Dev Notes

- Reuse the handler logic from S02 — extract a shared "process M-Pesa result" function so the cron and the webhook converge on the same idempotent credit path (`wallet.post(topup)`, idempotency key = `mpesa_callback.id`).
- Job lives in `apps/jobs`, registered in `apps/jobs/src/registry.ts`, on a 60s interval. Daraja `stkpushquery` belongs in the `packages/payments` mpesa adapter, credentials from env.
- SMS notifications use `packages/sms` (stub adapter at launch). Audited actions write to `audit_outbox`.

### Project Structure Notes
- New: `apps/jobs` reconciliation job + registry entry; `packages/payments/src/mpesa/stkQuery.ts`.
- Reuses S02's shared result-processing function and `mpesa_stk_request` / `mpesa_callback` tables in `packages/db`.
- Depends on S01 and S02.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E04]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
- `@bm/payments` 12 tests; `@bm/jobs` 12 tests (7 new reconcile tests); full suite passing.

### Completion Notes List

- AC1: `mpesa-reconcile` job registered in `apps/jobs` with `intervalMs: 60_000`.
- AC2: only pending rows (`STK_SENT`/`CALLBACK_PENDING`) with `updatedAt` older than 90s are queried via Daraja `stkpushquery`.
- AC3: success routes through the SAME idempotent path as the S02 callback — `mpesa_callback` insert `ON CONFLICT DO NOTHING` + `applyTopup` keyed by `mpesa_callback.id`; verified no double-credit when S02 already credited (exactly one ledger row).
- AC4: failure → `FAILED` + `@bm/sms` stub SMS + `payment.mpesa.reconcile.failed` audit.
- AC5: pending > 15 min → `EXPIRED` (additive migration 0019 widens the CHECK constraint; `MpesaStkState` contract widened) + `payment.mpesa.reconcile.expired` audit.
- Money is taken from our own `mpesa_stk_request.amount` (KES → cents), never any Daraja-supplied amount.
- Adapter `stkQuery` is transport-injected/mockable; no real network in tests.

### File List

- `packages/payments/src/mpesa/stkPush.ts` (added `stkQuery` + `StkQueryInput`/`StkQueryResult`)
- `packages/payments/src/index.ts` (exports)
- `packages/payments/src/mpesa/stkQuery.test.ts` (new)
- `apps/jobs/src/jobs/mpesa-reconcile.ts` (new)
- `apps/jobs/src/jobs/mpesa-reconcile.test.ts` (new)
- `apps/jobs/src/registry.ts` (`Job.intervalMs`)
- `apps/jobs/src/index.ts` (`registerMpesaReconcileJob` + exports)
- `apps/jobs/package.json` (`@bm/payments`, `@bm/sms` deps)
- `packages/db/migrations/0019_mpesa_stk_request_expired_state.sql` (new, additive)
- `packages/db/src/schema/mpesa.ts` (state comment)
- `packages/contracts/src/index.ts` (`MpesaStkState` + `EXPIRED`)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented STK reconciliation cron (adapter `stkQuery`, 60s job, idempotent recovery, FAILED/EXPIRED handling); full gate green | claude-opus-4-7 |
