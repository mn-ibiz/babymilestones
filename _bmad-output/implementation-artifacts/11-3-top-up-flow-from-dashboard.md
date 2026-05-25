# Story 11.3: Top-up flow from dashboard

Status: done

> Canonical ID: P1-E11-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S03.md

## Story

As a parent,
I want to top up via the dashboard without going to Reception,
so that I can fund my wallet from my phone using M-Pesa, card, or bank transfer.

## Acceptance Criteria

1. M-Pesa STK: enter amount → tap "Pay" → STK push to phone → live status → success state with new balance.
2. Paystack card: redirect to hosted checkout → return → verifying → success.
3. Bank transfer: instructions screen ("Send to X account; admin will confirm").
4. Failures show clear remediation copy.

## Tasks / Subtasks

- [x] Task 1: Top-up charge API in `apps/api` (AC: #1, #2, #3, #4)
  - [x] M-Pesa STK: initiate push, expose status polling; on confirmation credit wallet via `@bm/wallet` (idempotent) — reused `apps/api/src/routes/payments/mpesa/*` (P1-E04-S01)
  - [x] Paystack: initialize hosted checkout, handle return + verify; credit wallet on success — reused `apps/api/src/routes/payments/paystack/*` (P1-E04-S04/S05)
  - [x] Bank transfer: manual admin-confirmation path — reused `apps/api/src/routes/payments/bank/*` (P1-E04-S07); the parent flow is informational (no in-app charge), so no new API route was added.
  - [x] Map provider errors to clear remediation messages — `failureRemediation()` in `lib/topup-flow.ts`
  - [~] Single unified `apps/api/src/routes/topup.ts` aggregator — deferred: epic 4 already ships the four provider routes (`mpesa`, `paystack`, `cash`, `bank`) under `apps/api/src/routes/payments/`. Reused those rather than recreating a parallel surface; the dashboard wires straight to them.
- [x] Task 2: Top-up UI flow in `apps/platform` authed route group (AC: #1, #2, #3, #4)
  - [x] Method picker (entry from Wallet page, P1-E11-S01) — `TOP_UP_METHODS` in `lib/wallet.ts` hands off to the `/top-up` page anchors; bank href fixed to `#bank-heading`.
  - [x] M-Pesa: amount entry → "Pay" → live status → success — `app/components/TopUpForm.tsx` (P1-E04-S01)
  - [x] Paystack: redirect to hosted checkout → return → verifying → success — `app/components/PaystackTopUpForm.tsx` + `PaystackReturn.tsx` (P1-E04-S04)
  - [x] Bank transfer: instructions screen — new `app/components/BankTransferInstructions.tsx` + `#bank-heading` section on `app/top-up/page.tsx` (AC3)
  - [x] Failure states with remediation copy across all methods — tested `failureRemediation()` helper; existing rail components retain inline copy (see review findings).
  - [~] Route nested under `app/(app)/wallet/topup/` — deferred: the wired entry point is the existing `/top-up` page (epic 4); kept it as the single top-up surface and added the bank rail there instead of forking a second path.
- [x] Task 3: Tests (AC: all)
  - [x] vitest, test-first: method dispatch wiring, amount validation, pending→terminal state logic, bank instruction lines, failure remediation copy — `lib/topup-flow.test.ts` (17 tests). M-Pesa/Paystack init+status and bank wallet-credit idempotency are covered by the epic-4 suites being reused.

## Dev Notes

- Charge logic in `apps/api` via `@bm/payments` (adapters `mpesa`, `paystack`, `cash`; unified Charge interface) and `@bm/wallet` for crediting (idempotency required). UI in `apps/platform` authed route group, mobile-first, using `packages/ui`.
- Webhook/return handling lives in `apps/api` (single API surface owns webhooks). Wallet credit must be idempotent against provider callbacks.
- Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only.

### Project Structure Notes
- `apps/api/src/routes/topup.ts` (+ provider webhook routes), `apps/platform/app/(app)/wallet/topup/`. Reuses `@bm/payments` and `@bm/wallet`.
- Depends on P1-E04 (payments) per source Dependencies. Entry point is the Wallet page (P1-E11-S01).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E11.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

Full gate green from repo root: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. New suite `lib/topup-flow.test.ts` (17 tests); platform package 67 tests total passing.

### Completion Notes List

- The async rails (M-Pesa STK, Paystack card) and their API endpoints were already shipped by P1-E04 (S01/S04/S05) and are wired into the dashboard via `app/top-up/page.tsx` + `TopUpForm`/`PaystackTopUpForm`/`PaystackReturn`. This story reused them rather than recreating any charge API.
- Net-new for this story: (1) `lib/topup-flow.ts` — the shared, dependency-free dispatch/validation/pending-state seam plus bank instructions, built test-first; (2) AC3 bank-transfer instructions screen (`BankTransferInstructions.tsx` + a `#bank-heading` section on the top-up page), which was the missing rail (the picker linked to a non-existent `#bank` anchor); (3) fixed the picker's bank href to the real `#bank-heading` anchor.
- Bank transfer is admin-confirmed (P1-E04-S07): the parent flow is purely informational, so no in-app charge/API call is initiated — matching AC3 ("instructions screen; admin will confirm").
- One review (self): no blockers. Two low-severity follow-ups logged to `11-3-top-up-flow-from-dashboard-review-findings.md` (shared remediation helper not yet consumed by the epic-4 rail components; bank account details hard-coded as constants).

### File List

- `apps/platform/lib/topup-flow.ts` (new)
- `apps/platform/lib/topup-flow.test.ts` (new)
- `apps/platform/app/components/BankTransferInstructions.tsx` (new)
- `apps/platform/app/top-up/page.tsx` (modified — bank section + AC docs)
- `apps/platform/lib/wallet.ts` (modified — bank picker href → `#bank-heading`)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Dashboard top-up flow: pure dispatch/validation/pending-state module + AC3 bank-transfer instructions screen; reused epic-4 M-Pesa/card rails; status done | claude-opus-4-7 |
