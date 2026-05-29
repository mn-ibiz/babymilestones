# Story 19.5: End-of-day cash-up

Status: done

> Canonical ID: P2-E04-S05 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S05.md

## Story

As cashier,
I want to close the till at end-of-day and report any variance,
so that the capability described above is delivered.

## Acceptance Criteria

1. "End of day" CTA shows: expected cash (sum of cash sales), expected M-Pesa, expected Paystack.
2. Cashier enters actual cash counted; variance computed.
3. Variance > KES 500 → reason text required.
4. Audit + writes to Treasury reconciliation feed (P1-E06).

## Tasks / Subtasks

- [x] Task 1: Implement End-of-day cash-up (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: "End of day" CTA shows: expected cash (sum of cash sales), expected M-Pesa, expected Paystack.
  - [x] Satisfy AC#2: Cashier enters actual cash counted; variance computed.
  - [x] Satisfy AC#3: Variance > KES 500 → reason text required.
  - [x] Satisfy AC#4: Audit + writes to Treasury reconciliation feed (P1-E06).
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

### Review Findings

Adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor), 2026-05-30.
Auditor: all 4 ACs PASS (with 2 notes, addressed below).

Patches (applied this session):
- [x] [Review][Patch] Claim-by-update period model — each paid sale is stamped `cashed_up_at` when closed, so a sale is counted in exactly ONE cash-up; the close atomically claims (UPDATE … WHERE cashed_up_at IS NULL RETURNING) and sums the claimed set inside the tx. Fixes the stale expected-read, concurrent double-count, and the "sales committed between read and close fall in a gap" bug [migration 0057, pos-sales schema, cashup.ts]
- [x] [Review][Patch] Fail closed on an unreconcilable variance — a non-zero variance with no active cash-drawer float now returns 409 instead of silently recording a discrepancy that never reaches Treasury (AC4) [cashup.ts]
- [x] [Review][Patch] Blank counted-cash guard — `Number("")===0` is finite, so the submit guard now also rejects an empty field (was submittable as a 0 count) [CashUp.tsx]
- [x] [Review][Patch] Deterministic cash-drawer float pick — ordered lookup when multiple active drawers exist [cashup.ts]

Dismissed (rationale): `bigint`→`Number()` on the SQL SUM (codebase-wide convention; KES cents ≪ 2^53); float-cents `Math.round(x*100)` on the counted input (matches PayPanel; `min/step` on the input); boilerplate default reason for a sub-threshold non-zero variance (AC3 requires a reason only over KES 500); cashier self-approval (the `reconciliation_adjustments` posted_by≠approved_by CHECK + the treasury-only approve capability already block it); non-null assertions / FK index (codebase norms).

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S04 - P1-E06. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E04.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story workflow)

### Debug Log References

- `pnpm test` → 17/17 packages green (API incl. 6 new cash-up tests; POS app 77 incl. 3 new cash-up)
- `pnpm typecheck` / `pnpm lint` → 17/17 clean · `pnpm --filter @bm/pos build` → ok (`/cashup` route)

### Completion Notes List

- **`pos_cashups` table + migration 0058** — one row per till close: expected takings by method, counted
  cash, signed variance, optional reason, and a link to the reconciliation adjustment.
- **Expected takings** are summed from paid `pos_sales` (S04) by method, scoped to the cashier **since
  their previous cash-up** (all-time if first) — avoids day-boundary flakiness and double-counting across
  closes. Wallet sales are excluded (they settle against a parent wallet, not a till float).
- **AC1** — `GET /pos/cashup/expected` returns expected cash / M-Pesa / Paystack; the "End of day" CTA in
  the till header opens the cash-up screen which shows them.
- **AC2** — `POST /pos/cashup` recomputes expected server-side and computes variance = counted − expected
  cash; the UI shows it live as the cashier counts.
- **AC3** — a variance over KES 500 (shared `cashupReasonRequired`/threshold in `@bm/contracts`) requires a
  reason; enforced both client-side and authoritatively in the route (400 without it).
- **AC4** — any non-zero variance posts a **pending `reconciliation_adjustments`** row against the active
  cash-drawer float (the P1-E06 dual-approval feed — cashier posts, Treasury approves), linked on the
  cash-up; the close is audited (`pos.cashup.closed`). The cash-up + adjustment + audit are one transaction.
- TDD; pure variance/threshold helpers unit-tested, component a thin render, route behaviour integration-tested.

### File List

**Added**
- `packages/db/src/schema/pos-cashups.ts`
- `packages/db/migrations/0058_pos_cashups.sql`
- `apps/api/src/routes/pos/cashup.ts`, `apps/api/src/routes/pos/cashup.test.ts`
- `apps/pos/lib/cashup.ts`, `apps/pos/lib/cashup.test.ts`
- `apps/pos/lib/cashup-api.ts`
- `apps/pos/app/components/CashUp.tsx`
- `apps/pos/app/(pos)/cashup/page.tsx`

**Modified**
- `packages/auth/src/audit-actions.ts` (+`pos.cashup.closed`)
- `packages/db/src/schema/index.ts` (export pos-cashups)
- `packages/contracts/src/index.ts` (cash-up schemas/types + threshold helper)
- `apps/api/src/routes/pos/index.ts` (register cash-up)
- `apps/pos/app/components/TillHeader.tsx` ("End of day" CTA)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Implemented end-of-day cash-up: expected sums from paid sales, variance + reason gate, reconciliation-feed write (P1-E06) + audit, CashUp UI (TDD) | Amelia (dev-story) |
| 2026-05-30 | 1.1 | Adversarial code review: 4 patches (claim-by-update period model, fail-closed on unreconcilable variance, blank-count guard, deterministic float pick), rest dismissed. 7 cash-up tests + full suite green → done | bmad-code-review |
