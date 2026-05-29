# Story 17.6: Cancel subscription

Status: done

> Canonical ID: P2-E02-S06 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S06.md

## Story

As parent,
I want to cancel my subscription and not be charged again,
so that the capability described above is delivered.

## Acceptance Criteria

1. Cancel from parent dashboard; effective at `current_period_end` (current period plays out).
2. Cancellation reversible until period end.
3. No refunds on already-paid periods (refunds handled offline per spec).

## Tasks / Subtasks

- [x] Task 1: Implement Cancel subscription (AC: #1, #2, #3)
  - [x] Satisfy AC#1: `cancel_at_period_end` flag (sub stays active + usable); renewal cron terminates at period end with no charge. `POST /parents/me/subscriptions/:id/cancel`.
  - [x] Satisfy AC#2: `/uncancel` clears the flag until the cron flips to cancelled; race-safe (conditional update).
  - [x] Satisfy AC#3: no refund logic — the already-paid period is neither charged again nor refunded.
- [x] Task 2: Tests (AC: all)
  - [x] catalog (schedule/reverse); jobs (terminate-at-period-end, paused-reap); API (cancel/uncancel). Full suite green.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S02. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S06.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E02.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story + bmad-code-review)

### Completion Notes List

- Migration 0051: `cancel_at_period_end`. catalog request/reverse cancellation; renewal cron terminates flagged subs at period end (active) or immediately (dunning/paused) without charging.
- Cancel UI on the parent dashboard is a follow-on alongside the subscriptions-list surface (deferred with 17-4's note); backend + API complete.
- Completes Epic 17 (Subscription Plans), 6/6.

### File List

- `packages/db/migrations/0051_subscription_cancel.sql`, `schema/subscriptions.ts`
- `packages/catalog/src/subscriptions.ts` (request/reverse) + test, `index.ts`
- `apps/jobs/src/jobs/subscription-renew.ts` (scheduled-cancel termination) + test
- `apps/api/src/routes/parents/subscriptions.ts` (cancel/uncancel) + test
- `packages/auth/src/audit-actions.ts` (subscription.cancel_requested/reversed/cancelled)

## Senior Developer Review (AI)

**Date:** 2026-05-29 · **Outcome:** Approved after fixes · **Reviewer:** combined Blind+Edge+Acceptance.

Resolved: **(High) paused + cancel-scheduled zombie** — the cron only saw active/dunning, so a cancelled-then-paused sub never terminated and blocked re-subscribe; the cron now also reaps paused+flagged subs. **(Low) reverse-vs-cron race** — the cancel UPDATE is conditional on the flag still being set, so a concurrent un-cancel wins.

Verified: cancel keeps the sub active + entitlement usable through the period (AC1); reversible until the flip (AC2); no refund (AC3); dunning cancel is consistent (a dunning sub's period has already ended). UI deferred (follow-on).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 0.2 | Implemented AC1–AC3 (scheduled cancel + reverse) + code-review (2 fixes incl. HIGH paused-zombie reap). Epic 17 complete (6/6). Status → done. | bmad-dev-story + code-review |
