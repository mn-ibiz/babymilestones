# Story 17.1: Subscription plan catalogue

Status: done

> Canonical ID: P2-E02-S01 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S01.md

## Story

As admin, I want to define subscription plans like "8 Play sessions per month" with price and entitlement.

## Acceptance Criteria

1. `subscription_plans` table: name, service_id, entitlement_count, period (`week`|`month`|`term`), price, is_active.
2. CRUD with audit.
3. Plan price changes are effective-dated like services.

## Tasks / Subtasks

- [x] Task 1: Implement Subscription plan catalogue (AC: #1, #2, #3)
  - [x] Satisfy AC#1: `subscription_plans` (migration 0046) + `subscription_plan_prices`; CHECK entitlement>0, period ∈ {week,month,term}, is_active default.
  - [x] Satisfy AC#2: `@bm/catalog` CRUD (createPlan/updatePlan/getPlan/listPlans) + admin routes (`manage service`), every mutation audited (catalog.plan.*).
  - [x] Satisfy AC#3: `setPlanPrice` effective-dated (atomic close-old + insert-new, backdate rejected) — faithful mirror of `setServicePrice`.
- [x] Task 2: Tests (AC: all)
  - [x] catalog subscriptions (CRUD + price history/resolve/backdate — 6); API admin plans (CRUD + audit + RBAC + price — 6). Full suite green.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E07.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E02.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story + bmad-code-review)

### Completion Notes List

- Faithful mirror of the P1-E07-S01 service catalogue: `subscription_plans` + effective-dated `subscription_plan_prices`, `@bm/catalog` subscriptions module, contracts, audit actions, admin CRUD routes.
- Backend-complete; admin UI (a plans management screen) is a thin follow-on over the same API the services admin page uses.

### File List

- `packages/db/migrations/0046_subscription_plans.sql`, `schema/subscriptions.ts`, `schema/index.ts`
- `packages/catalog/src/subscriptions.ts` + test, `index.ts`
- `packages/contracts/src/index.ts` (plan schemas); `packages/auth/src/audit-actions.ts` (catalog.plan.*)
- `apps/api/src/routes/admin/plans.ts` + test, `admin/index.ts`

## Senior Developer Review (AI)

**Date:** 2026-05-29 · **Outcome:** Approved after fixes (faithful, correct mirror; all 3 ACs met) · **Reviewer:** combined Blind+Edge+Acceptance.

Resolved: **(Med) `subscription_plan_prices` dropped the `CHECK (effective_to IS NULL OR effective_from < effective_to)` range guard** that `service_prices` carries — restored. **(Low) index parity** — made it composite `(plan_id, effective_from)` like `service_prices`. Idempotency, RBAC, audit, atomic effective-dated pricing verified. Lower-severity enum-duplication / inactive-service notes match the established service pattern (consistent, not defects).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 0.2 | Implemented AC1–AC3 (plan catalogue + effective-dated pricing) + code-review (2 fixes for service-pattern parity). Full suite green. Status → done. | bmad-dev-story + code-review |
