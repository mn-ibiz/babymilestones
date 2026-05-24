# Story 4.1: M-Pesa STK push initiated from parent dashboard

Status: done

> Canonical ID: P1-E04-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S01.md

## Story

As a parent,
I want to top up by entering an amount and tapping "Pay", then approving on my phone,
so that I can fund my wallet via M-Pesa without leaving the dashboard.

## Acceptance Criteria

1. Top-up form: amount (KES, min 50, max 70,000 per STK call), confirm button.
2. Server calls Daraja `stkpush`; persists `mpesa_stk_request` row keyed by `CheckoutRequestID`.
3. UI shows "Check your phone…" with a 90-second progress indicator.
4. Polling endpoint returns current status; transitions reflected live.
5. Audit logged.

## Tasks / Subtasks

- [x] Task 1: Add `mpesa_stk_request` table + migration in `packages/db` (AC: #2)
  - [x] Drizzle schema: columns for `checkout_request_id` (unique), `merchant_request_id`, `parent_id`, `wallet_id`, `amount`, `phone`, `state`, timestamps; state machine `INITIATED → STK_SENT` (later states `CALLBACK_PENDING`/`SUCCEEDED`/`FAILED` reserved in the CHECK for S02/S03)
  - [x] Additive-only migration `0017_mpesa_stk_request.sql`
- [x] Task 2: Implement M-Pesa adapter STK init in `packages/payments` (AC: #2)
  - [x] `packages/payments/src/mpesa/stkPush.ts` — wrap Daraja `stkpush` behind an INJECTED transport (no real network in tests); Daraja credentials from env only (never DB)
  - [x] Conform to the unified `Charge` interface; a successful push is a `pending` charge holding `CheckoutRequestID`
- [x] Task 3: Add init route in `apps/api` (AC: #1, #2, #5)
  - [x] `apps/api/src/routes/payments/mpesa/initiate.ts`; validate amount via `@bm/contracts` Zod (min 50, max 70,000)
  - [x] Persist `mpesa_stk_request` keyed by `CheckoutRequestID` (state `STK_SENT`); write audit `payment.mpesa.stk.initiate` to `audit_outbox` in the same tx
- [x] Task 4: Add status polling endpoint in `apps/api` (AC: #4)
  - [x] `GET /payments/mpesa/stk/:checkoutRequestId` returns current `state`, scoped to the requesting parent (ownership enforced)
- [x] Task 5: Build top-up UI in `apps/platform` (AC: #1, #3, #4)
  - [x] `TopUpForm` (amount + confirm) + `/top-up` page; "Check your phone…" 90s countdown; polls the status endpoint, reflects transitions live
- [x] Task 6: Tests (AC: all)
  - [x] Unit test STK init adapter + amount validation; integration test for route persisting `mpesa_stk_request` and audit write; UI client + polling-helper test (vitest, test-first). Live in-browser DOM polling render is covered at the helper level (`mpesa-api`), not a full React render harness.

## Dev Notes

- Daraja credentials live in env vars only, never in the DB. Init route at `apps/api/src/routes/payments/mpesa/initiate.ts`.
- State machine for this story: `INITIATED → STK_SENT` (callback handling is S02; `CALLBACK_PENDING` consumed by the S03 cron).
- Adapter lives in `packages/payments` (mpesa adapter, unified Charge interface). DB table `mpesa_stk_request` keyed by `CheckoutRequestID` lives in `packages/db`. Wallet crediting happens later in S02 via `packages/wallet` — this story only initiates.
- Audited actions must write to `audit_outbox`.

### Project Structure Notes
- New: `packages/db` table `mpesa_stk_request` + migration; `packages/payments/src/mpesa/stkPush.ts`; `apps/api/src/routes/payments/mpesa/initiate.ts` + status polling route; top-up form in `apps/platform/app/`.
- Amount validation schema in `packages/contracts`.
- Depends on P1-E03-S03 (parent wallet account).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E04]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green from repo root: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
- Fixed adapter timestamp test: Daraja timestamps are EAT (UTC+3); 08:30 UTC → 11:30 EAT.
- Fixed platform typecheck/lint: typed the vitest `fetch` mock so `.mock.calls` indexing is sound.

### Completion Notes List

- Adapter (`@bm/payments`) wraps Daraja `stkpush` behind the unified `Charge`
  interface with an INJECTED `DarajaTransport` — tests pass a fake transport, so
  no real network is ever hit. Production passes `globalThis.fetch` + env config.
- `mpesa_stk_request` (provider-prefixed) persists only on Daraja acceptance, in
  state `STK_SENT`, keyed by the unique `CheckoutRequestID` so the S02 callback
  resolves it idempotently. Wallet + payer phone derived from the session.
- Audit (`payment.mpesa.stk.initiate`) written in the same transaction (AC5).
- Daraja credentials are read from env only (`mpesaConfigFromEnv`), never DB; the
  M-Pesa routes register only when full config (or an explicit test dep) is present.
- Wallet crediting is deliberately NOT done here — it lands on the S02 callback.
- Lower-severity follow-ups recorded in
  `4-1-m-pesa-stk-push-initiated-from-parent-review-findings.md`.

### File List

- packages/db/migrations/0017_mpesa_stk_request.sql (new)
- packages/db/src/schema/mpesa.ts (new)
- packages/db/src/schema/index.ts (edit)
- packages/contracts/src/index.ts (edit — STK initiate schema + bounds + types)
- packages/payments/src/mpesa/stkPush.ts (new)
- packages/payments/src/mpesa/stkPush.test.ts (new)
- packages/payments/src/index.ts (edit — adapter exports)
- apps/api/src/routes/payments/mpesa/initiate.ts (new)
- apps/api/src/routes/payments/mpesa/index.ts (new)
- apps/api/src/routes/payments/mpesa/initiate.test.ts (new)
- apps/api/src/app.ts (edit — register routes + env config)
- apps/platform/lib/mpesa-api.ts (new)
- apps/platform/lib/mpesa-api.test.ts (new)
- apps/platform/app/components/TopUpForm.tsx (new)
- apps/platform/app/top-up/page.tsx (new)
- _bmad-output/implementation-artifacts/4-1-m-pesa-stk-push-initiated-from-parent-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented M-Pesa STK push initiation: db table + migration, injected Daraja adapter, parent-auth init + polling routes, top-up UI; full gate green | claude-opus-4-7 |
