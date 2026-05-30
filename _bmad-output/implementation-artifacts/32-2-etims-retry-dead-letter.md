# Story 32.2: eTIMS retry + dead-letter

Status: done

> Canonical ID: P5-E02-S02 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S02.md

## Story

As the system, if KRA is down, I shouldn't lose the receipt.

## Acceptance Criteria

1. Failures queued to `kra_etims_queue` for retry by the jobs runner.
2. Exponential backoff up to 24h; alert if dead-lettered.
3. Admin can manually retry / inspect failures from Settings.

## Tasks / Subtasks

- [x] Task 1: Implement eTIMS retry + dead-letter (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Failures queued to `kra_etims_queue` (migration 0072 + drizzle schema) for retry by the jobs runner (`createEtimsRetryJob`, current jobs pattern; claims due `pending` rows). `enqueueEtimsSubmission` is idempotent on the `<series>-<sequence>` key.
  - [x] Satisfy AC#2: Exponential backoff (1m, 2m, 4m...) capped at 24h (`etimsBackoffMs`); a row that exhausts `max_attempts` becomes `dead_letter` and writes an `etims.submission.dead_lettered` audit row — that is the alert.
  - [x] Satisfy AC#3: Admin GET `/admin/etims/dead-letters` + POST `/admin/etims/dead-letters/:id/retry` (guarded by `manage config`); requeue resets the row to pending/due-now and audits `etims.submission.requeued`.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first: 9 queue (backoff math + PGlite state machine) + 7 retry-worker + 6 admin-route tests; audit-catalogue completeness green.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P3-E06
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E02.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- `pnpm -C packages/payments exec vitest run src/receipts/etims-queue.test.ts` → 9 passed.
- `pnpm -C apps/jobs exec vitest run src/jobs/etims-retry.test.ts` → 7 passed.
- `pnpm -C apps/api exec vitest run src/routes/admin/etims.test.ts` → 6 passed.
- `pnpm -C packages/auth exec vitest run src/audit-actions.test.ts` → 4 passed (catalogue completeness green with the new etims actions).
- Full payments suite 100 passed (13 files). tsc clean: payments, db, jobs, api, auth.

### Completion Notes List

- New `kra_etims_queue` table (migration 0072, mirrored by `packages/db/src/schema/kra-etims-queue.ts` + barrel re-export). Stores the full WriteReceiptPayload so a retry re-attempts standalone; `idempotency_key` is UNIQUE so a receipt is queued once.
- Queue helpers in `@bm/payments` (`enqueueEtimsSubmission`, `claimDueEtimsSubmissions`, `markEtimsSubmissionSent`, `recordEtimsSubmissionFailure`, `listDeadLetters`, `requeueDeadLetter`) + pure `etimsBackoffMs` (1m·2^n capped at 24h, `ETIMS_BACKOFF_CAP_MS`).
- Retry worker built on the CURRENT jobs pattern (`createEtimsRetryJob(deps): Job`, like `mpesa-reconcile`), wired via `registerEtimsRetryJob`. It does NOT depend on the concurrent Epic-28 jobs-runner. Resubmission is INJECTED (`EtimsResubmit`) so the worker is pure of transport and idempotency lives in the submit impl (re-uses the row's stable key → no duplicate KRA invoice). A failing row is isolated from the batch.
- Dead-letter only after a bounded `max_attempts`; the dead-letter writes `etims.submission.dead_lettered` (the alert) and an error log line.
- Admin surface (AC3): `/admin/etims/dead-letters` (list, read) + `/admin/etims/dead-letters/:id/retry` (requeue, audited), guarded by `manage config`.
- New audit actions catalogued: `etims.submission.sent|dead_lettered|requeued` (+ `etims.flag.changed`, `etims.vat_metadata.updated` reserved for 32-3/32-4).

### File List

- packages/db/migrations/0072_kra_etims_queue.sql (new)
- packages/db/src/schema/kra-etims-queue.ts (new)
- packages/db/src/schema/index.ts (barrel re-export)
- packages/payments/src/receipts/etims-queue.ts (new — backoff + state-machine helpers)
- packages/payments/src/receipts/etims-queue.test.ts (new — 9 tests)
- packages/payments/src/receipts/index.ts + packages/payments/src/index.ts (queue exports)
- apps/jobs/src/jobs/etims-retry.ts (new — 60s worker, injected resubmit)
- apps/jobs/src/jobs/etims-retry.test.ts (new — 7 tests)
- apps/jobs/src/index.ts (register + export the retry job)
- apps/api/src/routes/admin/etims.ts (new — dead-letter list + manual retry)
- apps/api/src/routes/admin/etims.test.ts (new — 6 tests)
- apps/api/src/routes/admin/index.ts (register the admin eTIMS routes)
- packages/auth/src/audit-actions.ts (etims action catalogue: submission.sent/dead_lettered/requeued + flag.changed/vat_metadata.updated)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | eTIMS retry/dead-letter queue + worker + admin inspect/retry; migration 0072 | claude-opus-4-8 |
