# Story 17.4: Pause/freeze and resume a subscription

Status: done

> Canonical ID: P2-E02-S04 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S04.md

## Story

As parent,
I want to pause my subscription when we travel and resume later — without losing what I paid for,
so that the capability described above is delivered.

## Acceptance Criteria

1. Pause from parent dashboard or by admin/Reception; `status='paused'`; entitlement remaining frozen.
2. While paused: no new period charges, bookings forbidden under the plan, wallet pay-as-you-go still works.
3. Resume restores `status='active'`; period dates shifted by the pause duration; entitlement carries over.
4. Audit logged at pause and resume.

## Tasks / Subtasks

- [x] Task 1: Implement Pause/freeze and resume a subscription (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: `pauseSubscription` (status→paused, paused_at; entitlement frozen). Parent route + reception route (admin/Reception path).
  - [x] Satisfy AC#2: paused subs aren't matched by the entitlement-first booking (only matches active) → wallet pay-as-you-go fallback; no charge mechanism to suppress (renewal is S05).
  - [x] Satisfy AC#3: `resumeSubscription` shifts both period dates by the pause duration; entitlement carries over; pause_history closed interval.
  - [x] Satisfy AC#4: `subscription.paused`/`subscription.resumed` audited in-txn (actor = session user).
- [x] Task 2: Tests (AC: all)
  - [x] catalog pause/resume (freeze, shift, state guards — 4); API parent (pause→resume, double-pause 409, ownership 404) + reception pause. Full suite green.

## Dev Notes

Carryover behaviour locked by Decision 3. `subscriptions.pause_history` JSONB.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S02.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E02.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story + bmad-code-review)

### Completion Notes List

- Migration 0049: `paused_at` + `pause_history`; widened the per-(child,plan) unique fence to non-cancelled subs.
- catalog `pauseSubscription`/`resumeSubscription` (FOR UPDATE + state guards, period shift on resume, in-txn audit).
- Parent routes (ownership) + reception routes (create-payment) for pause/resume.

### File List

- `packages/db/migrations/0049_subscription_pause.sql`, `schema/subscriptions.ts`
- `packages/catalog/src/subscriptions.ts` (pause/resume + errors) + test, `index.ts`
- `packages/auth/src/audit-actions.ts` (subscription.paused/resumed)
- `apps/api/src/routes/parents/subscriptions.ts` (parent pause/resume) + `reception/booking.ts` (reception pause/resume) + test

## Senior Developer Review (AI)

**Date:** 2026-05-29 · **Outcome:** Approved after fixes · **Reviewer:** combined Blind+Edge+Acceptance.

Resolved: **(High) pausing freed the active-uniq fence → re-subscribe double-charge + resume 500** — widened the fence + subscribe guard to non-cancelled subs (a paused sub still occupies the slot). **(Med) audit actor was the parent-profile id** — now the session user id. **(Low) pause ignored the injected clock** — fixed. **(AC1 gap) no admin/Reception route** — added reception pause/resume (create-payment).

Verified: entitlement frozen on pause; period shifts both dates by pause duration; concurrency via FOR UPDATE; cancelled-sub guarded.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 0.2 | Implemented AC1–AC4 (pause/resume + period shift) + code-review (4 fixes incl. HIGH double-charge fence + reception route). Full suite green. Status → done. | bmad-dev-story + code-review |
