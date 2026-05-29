# Story 17.2: Parent subscribes to a plan

Status: done

> Canonical ID: P2-E02-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S02.md

## Story

As parent,
I want to subscribe to a plan and pre-pay for the period,
so that the capability described above is delivered.

## Acceptance Criteria

1. From service page, "Subscribe" option lists eligible plans.
2. Subscription created; full period charged from wallet immediately.
3. `subscriptions` table: parent_id, child_id, plan_id, started_at, current_period_start, current_period_end, status (`active`|`paused`|`cancelled`), entitlement_remaining.
4. SMS-stub confirms; loyalty earns on the settled charge.

## Tasks / Subtasks

- [x] Task 1: Implement Parent subscribes to a plan (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: `GET /parents/me/services/:id/plans` + a "Subscribe & save" section on the service page.
  - [x] Satisfy AC#2: full period charged from wallet via `debit` (insufficient → 402, nothing left active).
  - [x] Satisfy AC#3: `subscriptions` table (migration 0047) with all fields + active-uniq fence.
  - [x] Satisfy AC#4: SMS-stub `subscription.confirmed`. Loyalty earn DEFERRED to the loyalty engine (P2-E05) — no loyalty-points ledger exists yet (wallet overview returns 0).
- [x] Task 2: Tests (AC: all)
  - [x] catalog (addPeriod clamp + plan helpers); API subscribe (charge/402/eligibility/duplicate/ownership — 6). Full suite green; platform builds.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E03
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E02.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story + bmad-code-review)

### Completion Notes List

- `subscriptions` table (migration 0047) + `addPeriod` (week/month/term, month-end clamped).
- `POST /parents/me/subscriptions`: creates the subscription + pending invoice atomically FIRST (the row is the idempotency anchor under the active-uniq index), debits the wallet on a stable key, and rolls back to cancelled + voids the invoice on insufficient funds (402). SMS confirm; audit.
- `GET /parents/me/services/:id/plans` + service-page Subscribe UI.
- Loyalty earn (AC4) deferred to P2-E05 (no loyalty ledger yet).

### File List

- `packages/db/migrations/0047_subscriptions.sql`, `schema/subscriptions.ts`
- `packages/catalog/src/subscriptions.ts` (`addPeriod`) + test, `index.ts`
- `packages/contracts/src/index.ts` (subscription + BookablePlan); `packages/auth/src/audit-actions.ts`; `packages/sms/src/templates.ts`
- `apps/api/src/routes/parents/subscriptions.ts` (new) + `index.ts`
- `apps/platform/lib/book-slots-api.ts` (clients); `app/(app)/book/service/[serviceId]/page.tsx` (Subscribe UI)
- Tests: `subscriptions.test.ts` (catalog + api)

## Senior Developer Review (AI)

**Date:** 2026-05-29 · **Outcome:** Approved after fixes · **Reviewer:** combined Blind+Edge+Acceptance.

Resolved: **(High, money) non-atomic charge + cross-midnight double-charge** — reordered to create the subscription+invoice atomically first (the active-uniq partial index is the idempotency fence; debit keyed on the stable subscription id; insufficient → rollback to cancelled + void). **(Low) `addPeriod` month-end rollover** — now clamps (Jan 31 +1mo → Feb 28/29) with tests. **(Low) duplicate race** — DB partial-unique index added.

Documented: loyalty earn deferred to P2-E05 (no loyalty ledger); `settled_on_credit` (auto-credit) intentionally creates the subscription; the plans-list endpoint lists active plans (POST enforces age eligibility + funds).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 0.2 | Implemented AC1–AC4 (subscribe + wallet pre-pay + table) + code-review (3 fixes incl. HIGH money/atomicity). Full suite green. Status → done. | bmad-dev-story + code-review |
