# Story 33.3: Rate limit + cost control

Status: in-progress

> Canonical ID: P5-E03-S03 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S03.md

## Story

As admin, I want a guardrail against runaway SMS spend.

## Acceptance Criteria

1. Per-day total cap (default 10,000) and per-recipient daily cap (default 10).
2. Exceeding caps queues the message for next day and alerts admin.
3. Admin can adjust caps in Settings.

## Tasks / Subtasks

- [ ] Task 1: Implement Rate limit + cost control (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Per-day total cap (default 10,000) and per-recipient daily cap (default 10).
  - [ ] Satisfy AC#2: Exceeding caps queues the message for next day and alerts admin.
  - [ ] Satisfy AC#3: Admin can adjust caps in Settings.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E03.

## Dev Agent Record

### Agent Model Used

### Debug Log References

- `pnpm -C packages/sms exec vitest run` → 70 passed (61 baseline + 9 limiter)
- `pnpm -C packages/sms exec tsc --noEmit` → clean
- `pnpm -C packages/db exec tsc --noEmit` → clean

### Completion Notes List

- `CappedSmsSender` implements the exact `SmsSender` interface and wraps any inner
  sender (the live adapter in prod) — seam-preserving, drop-in behind
  `resolveSmsSender`, no call-site change.
- Caps (AC1): per-day TOTAL (default 10,000) + per-recipient DAILY (default 10),
  plus a per-day cost ceiling. Enforced over the UTC day computed from an injected
  clock, so burst + day-boundary roll-over are deterministically tested.
- Accounting is durable in `sms_send_ledger` (migration 0075): one row per
  dispatched message with recipient + actual cost. Summed per UTC-day window;
  per-recipient counts isolate by phone. Survives restarts / multiple instances.
- Over-cap → DEFERRED, not dropped (AC2): the message is written to `sms_outbox`
  as `status=deferred` with `deferred_until` = the start of the next UTC day, so a
  retry worker can re-attempt it tomorrow when the window resets. The result
  carries `{ deferred: true, reason: "per_day" | "per_recipient" | "cost" }`.
- The cost decision is pre-send using a configurable estimated per-message cost
  (actual cost is only known after dispatch); the actual cost is recorded in the
  ledger so the next decision reflects real spend.
- Caps are settings-backed (`sms.cap.per_day`, `sms.cap.per_recipient_day`,
  `sms.cap.max_cost_cents_per_day`, `sms.cap.est_cost_cents`) and read live by
  `getSmsCaps` (AC3 — admin-adjustable via the generic Settings store). A
  zero/invalid stored cap falls back to the default rather than bricking the SMS
  path.
- Tests: 9 (defaults+config, per-day cap, per-recipient cap, cost ceiling,
  day-boundary rollover, precise per-day/per-recipient accounting, interface seam,
  defensive zero-cap).

### File List

- packages/sms/src/limiter.ts (new) — `CappedSmsSender`, `getSmsCaps`, `usageForDay`, `dayWindow`
- packages/sms/src/limiter.test.ts (new) — 9 tests
- packages/sms/src/index.ts (modified — limiter re-exports)
- packages/db/src/schema/sms-send-ledger.ts (new) — `sms_send_ledger` table
- packages/db/src/schema/index.ts (modified — re-export)
- packages/db/migrations/0075_sms_send_ledger.sql (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Per-day + per-recipient caps + cost ceiling; over-cap defers to next day (durable ledger, migration 0075); settings-backed caps. 9 tests green. | Claude Opus 4.8 |
