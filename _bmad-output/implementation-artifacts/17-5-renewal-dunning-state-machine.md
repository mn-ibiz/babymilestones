# Story 17.5: Renewal / dunning state machine

Status: done

> Canonical ID: P2-E02-S05 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S05.md

## Story

As the system, I must charge the next period when the current ends, and handle failures gracefully.

## Acceptance Criteria

1. On `current_period_end`, job attempts to charge the next period from wallet.
2. Success → period rolls, entitlement reset.
3. Failure (insufficient wallet, auto-credit off) → `status='dunning'`; SMS-stub notifies parent; daily retry for 3 days.
4. After 3 days unpaid → `status='paused'` until manually resumed.
5. Auto-credit-enabled parents charge through to negative balance.

## Tasks / Subtasks

- [x] Task 1: Implement Renewal / dunning state machine (AC: #1, #2, #3, #4, #5)
  - [x] Satisfy AC#1: daily `subscription-renew` cron charges due (period-ended) active subs from the wallet.
  - [x] Satisfy AC#2: success rolls the period (start=old end) + resets entitlement; audits `subscription.renewed`.
  - [x] Satisfy AC#3: insufficient → `dunning` + SMS + daily retry; `subscription.dunning` audit.
  - [x] Satisfy AC#4: after the 3-day grace → `paused` (pausedAt set so it's manually resumable).
  - [x] Satisfy AC#5: auto-credit → `settled_on_credit` treated as success (charges to negative).
  - [x] Touch / create: `apps/jobs/src/jobs/subscription-renew.ts`.
- [x] Task 2: Tests (AC: all)
  - [x] job tests (renew, dunning+SMS, auto-credit, retry-recover, grace-pause, replay-voids-redundant-invoice, grace-paused-resumable, not-due — 8). Full suite green.

## Dev Notes

`apps/jobs/subscriptions/renew.ts`. State transitions logged.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S02 - S04
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E02.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story + bmad-code-review)

### Completion Notes List

- Migration 0050: `dunning` status + `dunning_since`. Daily `subscription-renew` cron drives the state machine (charge → roll | dunning → retry → grace-pause).
- Idempotency key `renewal:<sub>:<periodEnd>` keeps a same-period retry from double-charging; on a debit replay the redundant invoice is voided (no phantom pending).
- Note: like every job in `apps/jobs`, the cron is registered but a scheduler that invokes `.run()` is wired by the deploy story (consistent with slot-generation/db-backup).

### File List

- `packages/db/migrations/0050_subscription_dunning.sql`, `schema/subscriptions.ts`
- `apps/jobs/src/jobs/subscription-renew.ts` (new) + test, `apps/jobs/src/index.ts`
- `packages/auth/src/audit-actions.ts` (subscription.renewed/dunning); `packages/sms/src/templates.ts` (subscription.dunning)

## Senior Developer Review (AI)

**Date:** 2026-05-29 · **Outcome:** Approved after fixes · **Reviewer:** combined Blind+Edge+Acceptance.

Resolved: **(Critical, money) non-transactional double-charge** — a crash between the committed debit and the period-roll could orphan a `pending` invoice that FIFO top-up would later settle; now a debit REPLAY voids the redundant invoice (verified by a replay test). **(High, AC4) grace-paused sub was unresumable** — the pause branch now sets `pausedAt`, so `resumeSubscription` works (verified).

Verified: period roll anchors to the prior end (no skipped beat on a late run); `settled_on_credit` (auto-credit) → success (AC5); `dunning_since` set once across retries; grace boundary exact (3×24h); paused/cancelled skipped. Documented: voided-invoice-per-retry clutter (harmless), no FOR UPDATE (singleton-cron assumption), price resolved at run date.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 0.2 | Implemented AC1–AC5 (renewal/dunning cron) + code-review (2 fixes incl. CRITICAL double-charge). Full suite green. Status → done. | bmad-dev-story + code-review |
