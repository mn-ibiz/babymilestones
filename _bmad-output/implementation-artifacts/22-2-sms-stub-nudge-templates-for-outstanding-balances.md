# Story 22.2: SMS-stub nudge templates for outstanding balances

Status: done

> Canonical ID: P2-E07-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E07-S02.md

## Story

As the system, I want to remind parents about their outstanding balance on a schedule.

## Acceptance Criteria

1. New templates registered: `outstanding.day1`, `outstanding.day7`, `outstanding.day30`.
2. Job in `apps/jobs/dunning/outstanding-reminders.ts` runs daily, queues stub-SMS per the schedule.
3. Parent opt-out from non-transactional reminders honoured (consent flag).

## Tasks / Subtasks

- [x] Task 1: Implement SMS-stub nudge templates for outstanding balances (AC: #1, #2, #3)
  - [x] Satisfy AC#1: New templates registered: `outstanding.day1`, `outstanding.day7`, `outstanding.day30`.
  - [x] Satisfy AC#2: Job in `apps/jobs/src/jobs/outstanding-reminders.ts` (the real layout; the story's `apps/jobs/dunning/` path hint is stale) runs daily, queues stub-SMS per the schedule; registered in the jobs registry.
  - [x] Satisfy AC#3: Parent opt-out from non-transactional reminders honoured via the `parents.sms_marketing_opt_in` consent flag (the non-transactional/marketing opt-out from story 2-4), checked through `@bm/sms` `isMarketingOptedIn`.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P1-E09 - S01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E07-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E07.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- AC1 — Registered three new SMS templates in `packages/sms/src/templates.ts`: `outstanding.day1`, `outstanding.day7`, `outstanding.day30`. Each is added to the `SmsTemplateKey` union and the `RENDERERS` map, rendering an escalating reminder from a single `amountKes` data field with the brand sign-off. Covered by a new `packages/sms/src/templates.test.ts` (renders each tier + asserts the required `amountKes` field).
- AC2 — Added the daily cron `createOutstandingRemindersJob` at `apps/jobs/src/jobs/outstanding-reminders.ts` (the real monorepo layout; the story's `apps/jobs/dunning/` path is stale). It sums each parent's open invoices (`status NOT IN ('settled','void')`, matching the wallet-overview definition of outstanding), ages the debt from the OLDEST open invoice's `created_at`, and queues the matching stub-SMS nudge when the age is exactly 1, 7, or 30 days (off-schedule days queue nothing). Daily cadence (`intervalMs = 24h`, `cron = "0 9 * * *"`). Each queued nudge is audited (`outstanding.reminder.sent`). Idempotent per debt-episode: the audit payload carries the oldest-invoice ISO marker, so a same-day (or any later milestone-day) re-run finds the prior audit and does not double-send, while a future distinct debt can still re-nudge. Wired into the registry via `registerOutstandingRemindersJob` + exports in `apps/jobs/src/index.ts`, matching the sibling jobs.
- AC3 — Non-transactional opt-out honoured: before queuing, the job calls `@bm/sms` `isMarketingOptedIn` (reads `parents.sms_marketing_opt_in`, the consent flag from story 2-4) and skips any parent who has not opted in. These reminders are non-transactional, so they are gated on the marketing/non-transactional opt-out.
- Tests: 12 tests in `apps/jobs/src/jobs/outstanding-reminders.test.ts` (each schedule milestone, off-schedule no-op, opt-out skip, settled/void no-op, idempotency, audit, multi-invoice sum aged from oldest, multiple independent parents, daily-cron descriptor) + 4 tests in `packages/sms/src/templates.test.ts`.
- Verification: `@bm/jobs` 106 tests pass, `@bm/sms` 69 tests pass. Full suite `pnpm test` 17/17 tasks successful; `pnpm typecheck` 17/17 successful. No regressions.
- Follow-up fix (2026-06-02): the new `outstanding.reminder.sent` audit action emitted by the job was missing from the audit catalogue (`packages/auth/src/audit-actions.ts`), which the `@bm/auth` audit-catalogue completeness test (X5-S03) flags. The initial `pnpm test` reported green because turbo caches `@bm/auth` against its own inputs and does not invalidate when an `apps/jobs` file changes; running `@bm/auth` directly surfaced the gap. Registered the action under a new `dunning` catalogue category and confirmed `@bm/auth` 82/82 green.

### File List

- `packages/sms/src/templates.ts` (modified — three new template keys + renderers)
- `packages/sms/src/templates.test.ts` (new — template render tests)
- `apps/jobs/src/jobs/outstanding-reminders.ts` (new — daily reminder cron)
- `apps/jobs/src/jobs/outstanding-reminders.test.ts` (new — cron tests)
- `apps/jobs/src/index.ts` (modified — import/export + `registerOutstandingRemindersJob`)
- `packages/auth/src/audit-actions.ts` (modified — registered `outstanding.reminder.sent` under a new `dunning` catalogue category)
- `_bmad-output/implementation-artifacts/22-2-sms-stub-nudge-templates-for-outstanding-balances.md` (story updates)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status → review)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Implemented outstanding-balance nudge templates + daily reminder cron with consent gating; all ACs covered by tests; Status → review | Amelia (dev-story) |
