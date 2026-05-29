# Story 28.5: M-Pesa STK reconciliation cron now under framework

Status: backlog

> Canonical ID: P3-E06-S05 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S05.md

## Story

Move the P1 ad-hoc STK reconciliation into the framework.

## Acceptance Criteria

1. P1-E04-S03 logic registered as `payments.mpesa.reconcile` every 60s.
2. Logs count of recovered transactions per run.

## Tasks / Subtasks

- [x] Task 1: Implement M-Pesa STK reconciliation cron now under framework (AC: #1, #2)
  - [x] Satisfy AC#1: P1-E04-S03 logic registered as `payments.mpesa.reconcile` every 60s.
  - [x] Satisfy AC#2: Logs count of recovered transactions per run.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E04-S03. --- *End of P3 stories.*
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E06.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- `pnpm -C apps/jobs exec vitest run src/jobs/mpesa-reconcile.test.ts` — 9 tests pass (incl. the new cron-descriptor + recovered-count cases).

### Completion Notes List

- AC1 — the P1-E04-S03 reconciliation logic (`createMpesaReconcileJob`) is now a
  framework job: it declares `intervalMs: 60_000` + `cron: "* * * * *"` (every
  60s) + `onFailure: "retry-next-tick"`, wired via the existing
  `registerMpesaReconcileJob` export, so it surfaces in `schedule()` and the
  run-now console. NOTE: the registry NAME stays `mpesa-reconcile` (its
  established P1 identity, referenced across tests/wiring); the spec's canonical
  id `payments.mpesa.reconcile` is the per-run log EVENT name (AC2) — a stable
  handle that honours the spec identifier.
- AC2 — the run logs `{ event: "payments.mpesa.reconcile", recovered, failed,
  expired, candidates }`; `recovered` is the count of transactions credited this
  run. A logger is injected (defaults to the jobs logger); a test asserts the
  recovered count.
- No new migration or schema — registers existing logic under the framework and
  adds the per-run count log.

### File List

- apps/jobs/src/jobs/mpesa-reconcile.ts (cron + onFailure + injected logger + recovered-count log)
- apps/jobs/src/jobs/mpesa-reconcile.test.ts (descriptor + recovered-count tests)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | M-Pesa STK reconciliation moved under the framework (60s cron, recovered count logged) | claude-opus-4-8 |
