# Story 4.3: STK reconciliation cron

Status: ready-for-dev

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

- [ ] Task 1: Add `stkpushquery` to the M-Pesa adapter (AC: #2)
  - [ ] `packages/payments/src/mpesa/stkQuery.ts` — wrap Daraja `stkpushquery`; credentials from env only
- [ ] Task 2: Register reconciliation job in `apps/jobs` (AC: #1)
  - [ ] Register via `apps/jobs/src/registry.ts`; schedule every 60s
- [ ] Task 3: Query pending requests and reconcile (AC: #2, #3)
  - [ ] Select `mpesa_stk_request` rows in `CALLBACK_PENDING` older than 90s; call `stkpushquery`
  - [ ] On success, route through the same idempotent handler path as S02 (shared function, idempotency key = `mpesa_callback.id`)
- [ ] Task 4: Failure + expiry handling (AC: #4, #5)
  - [ ] On query failure → set `FAILED`, send `@bm/sms` stub notification, write audit
  - [ ] Requests still pending >15 min → set `EXPIRED`
- [ ] Task 5: Tests (AC: all)
  - [ ] Unit/integration: success query reuses idempotent path (no double credit); failure → `FAILED` + SMS-stub; >15 min → `EXPIRED`; job only picks up rows older than 90s (vitest, test-first)

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
