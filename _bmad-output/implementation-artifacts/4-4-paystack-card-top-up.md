# Story 4.4: Paystack card top-up

Status: done

> Canonical ID: P1-E04-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S04.md

## Story

As a parent,
I want to top up with my Visa or Mastercard via Paystack,
so that I can fund my wallet by card since Stripe isn't available in Kenya.

## Acceptance Criteria

1. "Pay with card" CTA opens Paystack hosted checkout with `email` (parent), `amount`, `reference` (UUID).
2. Successful charge redirects back; UI shows "verifying…".
3. Server verifies via `transaction/verify`; treats webhook as source of truth.
4. Card-on-file: optional checkbox; uses Paystack's saved authorization for repeat top-ups.

## Tasks / Subtasks

- [x] Task 1: Implement Paystack adapter init + verify in `packages/payments` (AC: #1, #3, #4)
  - [x] `packages/payments/src/paystack/paystack.ts` — initialize transaction with `email`, `amount` (minor units), `reference` (UUID); secret key from config/env (server-only)
  - [x] `transaction/verify` call; accepts a saved `authorization_code` (card-on-file) for repeat top-ups
  - [x] Conforms to the unified Charge interface (provider-discriminated `PaystackCharge`)
- [x] Task 2: Add init route in `apps/api` (AC: #1, #4)
  - [x] `apps/api/src/routes/payments/paystack/init.ts`; generates UUID `reference`; persists `paystack_transaction`; carries the `saveCard` card-on-file flag
  - [x] Writes audit (`payment.paystack.init`) to `audit_outbox`
- [x] Task 3: Add verify endpoint in `apps/api` (AC: #2, #3)
  - [x] `GET /payments/paystack/verify/:reference` hit on redirect-back; calls `transaction/verify`; webhook (S05) remains source of truth for crediting; captures the reusable authorization when the parent opted in
- [x] Task 4: Build card top-up UI in `apps/platform` (AC: #1, #2, #4)
  - [x] "Pay with card" CTA → Paystack hosted checkout (redirects to the authorization URL); optional "save card" checkbox; "Verifying your payment…" state on the redirect-back return page
- [x] Task 5: Tests (AC: all)
  - [x] Unit test adapter init/verify + card-on-file path; integration test init route + verify endpoint (ownership-scoped); platform client unit tests (vitest, test-first)
  - [~] Full one-click repeat top-up via a stored authorization is deferred to the card-on-file loop alongside S05 (the webhook is the authoritative store of the reusable token) — see review findings.

## Dev Notes

- Init route at `apps/api/src/routes/payments/paystack/init.ts`. Paystack public key lives in the client; the secret key is server-only (env).
- The webhook (S05) is the source of truth for crediting the wallet — `transaction/verify` here is for UX confirmation, not the authoritative credit. Actual `wallet.post(topup)` happens on the verified `charge.success` webhook.
- Adapter lives in `packages/payments` (paystack adapter, unified Charge interface). Card-on-file reuses Paystack's saved authorization token.

### Project Structure Notes
- New: `packages/payments/src/paystack/init.ts` (+ verify); `apps/api/src/routes/payments/paystack/init.ts` + verify endpoint; card top-up UI in `apps/platform/app/`.
- Reference UUID + amount validation schema in `packages/contracts`.
- Depends on P1-E03-S03 (parent wallet account); credit path completed by S05.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E04]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green from repo root: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
- One typecheck fix in the platform client test: typed the `vi.fn` fetch mock
  (matching the existing `mpesa-api.test.ts` pattern) so the mock-call tuple is
  not inferred as `never`.

### Completion Notes List

- New Paystack adapter (`@bm/payments`) behind the unified Charge interface:
  `init` (transaction/initialize) + `verify` (transaction/verify), transport
  injected/mockable; secret key carried as Bearer auth from config (env in prod).
- `paystack_transaction` table (additive migration `0020`) keyed by the UUID
  `reference` (UNIQUE) so verify (this story) and the webhook (S05) resolve one
  row idempotently. Money stored as integer minor units (KES cents).
- Parent route `POST /payments/paystack/init` (parent-auth + CSRF): generates the
  UUID reference, derives wallet + email server-side, persists `INITIALIZED`,
  audits `payment.paystack.init`. Returns the hosted-checkout URL. 422 when the
  parent has no profile email (Paystack requires one); 502 on a rejected init.
- `GET /payments/paystack/verify/:reference` (ownership-scoped): UX confirmation
  via transaction/verify; advances state and captures the reusable
  `authorization_code` only when the parent opted into card-on-file. The webhook
  (S05) remains the authoritative crediting path — no wallet credit here.
- Platform UI: a "Pay with card" form (amount + optional "save card") that
  redirects to Paystack, and a redirect-back page that shows "Verifying your
  payment…".
- Lower-severity follow-ups (one-click repeat charge, client re-poll, currency
  assertion) logged in `4-4-paystack-card-top-up-review-findings.md`.

### File List

- packages/payments/src/paystack/paystack.ts (new)
- packages/payments/src/paystack/paystack.test.ts (new)
- packages/payments/src/index.ts (Paystack exports)
- packages/contracts/src/index.ts (paystackInitSchema, kesToMinorUnits, types)
- packages/contracts/src/index.test.ts (contract tests)
- packages/db/migrations/0020_paystack_transaction.sql (new, additive)
- packages/db/src/schema/paystack.ts (new)
- packages/db/src/schema/index.ts (barrel)
- apps/api/src/routes/payments/paystack/init.ts (new — init + verify)
- apps/api/src/routes/payments/paystack/index.ts (new)
- apps/api/src/routes/payments/paystack/init.test.ts (new)
- apps/api/src/routes/payments/mpesa/index.ts (PaymentsDeps + paystack; guard)
- apps/api/src/routes/payments/mpesa/initiate.ts (optional-mpesa guard)
- apps/api/src/app.ts (paystack wiring + env config)
- apps/platform/lib/paystack-api.ts (new)
- apps/platform/lib/paystack-api.test.ts (new)
- apps/platform/app/components/PaystackTopUpForm.tsx (new)
- apps/platform/app/components/PaystackReturn.tsx (new)
- apps/platform/app/top-up/page.tsx (M-Pesa + card sections)
- apps/platform/app/top-up/paystack/return/page.tsx (new)
- _bmad-output/implementation-artifacts/4-4-paystack-card-top-up-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Paystack card top-up: adapter, init+verify routes, `paystack_transaction` table, card top-up UI; full gate green | claude-opus-4-7 |
