# Story 5.3: Reception top-up (cash / M-Pesa / Paystack)

Status: done

> Canonical ID: P1-E05-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S03.md

## Story

As Reception,
I want to take a top-up from a parent in any payment method,
so that I can credit their wallet however they choose to pay.

## Acceptance Criteria

1. "Top up" CTA opens a sheet: amount field, method picker (Cash / M-Pesa STK / Paystack card / Bank transfer).
2. M-Pesa STK triggers parent's phone — Reception sees status updating live.
3. Cash route prints receipt immediately.
4. Audit logged with method.

## Tasks / Subtasks

- [x] Task 1: Top-up contract (AC: #1, #4)
  - [x] Add top-up Zod schema in `packages/contracts` (`receptionTopupSchema`: amount cents, method ∈ cash | mpesa_stk | paystack_card | bank_transfer, parentId) + `ReceptionTopupResponse`/`ReceptionTopupStatus`
- [x] Task 2: Top-up route via payments adapters (AC: #1, #2, #4)
  - [x] `apps/api/src/routes/reception/topup.ts` — dispatches to the `@bm/payments` adapters per method (`cash` via `recordCashTopup`+`@bm/wallet`, `mpesa_stk` via the Daraja adapter, `paystack_card` via the Paystack adapter); cash credit is idempotent
  - [x] M-Pesa STK: initiates STK push to the *parent's* phone; the wallet credit lands async on the `mpesa_*` callback (P1-E04-S02), kept idempotent there
  - [x] Wired into `apps/api/src/app.ts` (buildApp) via `registerReceptionRoutes`; every method writes an `audit_outbox` row carrying `method`
- [x] Task 3: Live status for STK (AC: #2)
  - [x] `GET /reception/topup/mpesa_stk/:checkoutRequestId` returns the STK state; the sheet polls it for live updates
- [x] Task 4: Cash immediate receipt (AC: #3)
  - [x] Cash path credits synchronously and queues the receipt SMS-stub immediately (receipt engine integration deferred to P1-E05-S06)
- [x] Task 5: Top-up sheet UI (AC: #1, #2, #3)
  - [x] `apps/admin` Reception — "Top up" CTA → sheet with amount + method picker; polls live STK status; cash shows receipt-printed terminal state. Logic in `lib/topup-form.ts`
- [x] Task 6: Tests per source "Tests" section (AC: all)
  - [x] Unit: method dispatch routing + idempotent cash credit (api integration via app.inject); sheet validation/status logic (admin lib)
  - [x] Integration: each method path; STK persisted pending + no premature credit; audit row carries method; RBAC + CSRF + validation
  - [~] E2E: covered by integration (app.inject) + admin unit tests; no Playwright run in this story (no `e2e/` harness wired for the reception sheet yet)

## Dev Notes

- Use the unified Charge interface in `@bm/payments` (adapters `cash`, `mpesa`, `paystack`); do not call providers directly from the route.
- M-Pesa is async: route initiates STK, confirmation arrives via the `mpesa_*` webhook which credits the wallet — keep the wallet credit idempotent.
- Cash settles synchronously and prints immediately (receipt per P1-E05-S06).
- Every top-up writes an `audit_outbox` row including the payment method.
- Source paths to touch: `apps/api/src/routes/reception/topup.ts`, `apps/admin` Reception top-up sheet, `packages/contracts` (top-up schema), `@bm/payments`, `@bm/wallet`.
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- Route in `apps/api/src/routes/reception/`; UI sheet in `apps/admin`; ledger via `packages/wallet`; provider adapters in `packages/payments`.
- Dependencies (from source): S01, S02, P1-E04 (payments adapters). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E05.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm test && pnpm typecheck && pnpm lint && pnpm build` — all green.
- New route suite: 16/16 (`apps/api/src/routes/reception/topup.test.ts`).

### Completion Notes List

- One staff endpoint `POST /reception/topup` dispatches by `method`, reusing the
  epic-4 primitives rather than re-implementing any rail: cash → synchronous
  `recordCashTopup` (FIFO settle, `source='cash:reception'`, immediate receipt
  SMS-stub); `mpesa_stk` → Daraja STK push to the parent's phone (202 pending,
  credit lands async on the C2B callback, P1-E04-S02); `paystack_card` → hosted
  checkout init (202 pending + authorizationUrl, credit on webhook P1-E04-S05).
- `bank_transfer` appears in the picker (AC1) but is admin-confirmed (P1-E04-S07);
  the endpoint returns 422 with guidance rather than crediting.
- Staff-only via rbac `create payment` (reception + cashier; others 403). Wallet +
  payer phone/email are derived server-side from `parentId` — never the body. The
  staff actor is the session user. Every dispatched method writes one
  `reception.topup` audit row carrying `method` (AC4).
- Live STK status: `GET /reception/topup/mpesa_stk/:checkoutRequestId`; the sheet
  polls it every 2s until terminal.
- No new migration (reuses `wallet_ledger`, `mpesa_stk_requests`,
  `paystack_transactions`, `audit_outbox`).
- See `5-3-reception-top-up-cash-m-pesa-paystack-review-findings.md` for deferred
  low-severity follow-ups.

### File List

- `packages/contracts/src/index.ts` (added `receptionTopupSchema`, `RECEPTION_TOPUP_METHODS`, `ReceptionTopupResponse`, `ReceptionTopupStatus`)
- `apps/api/src/routes/reception/topup.ts` (new)
- `apps/api/src/routes/reception/topup.test.ts` (new)
- `apps/api/src/routes/reception/index.ts` (wire topup + mpesa/paystack deps)
- `apps/api/src/app.ts` (resolve provider wiring once, pass to reception routes)
- `apps/admin/lib/topup-form.ts` (new)
- `apps/admin/lib/topup-form.test.ts` (new)
- `apps/admin/app/reception/page.tsx` (Top-up CTA + sheet)
- `_bmad-output/implementation-artifacts/5-3-reception-top-up-cash-m-pesa-paystack-review-findings.md` (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Reception unified top-up implemented (cash/M-Pesa STK/Paystack dispatch, live STK status, sheet UI, tests) | claude-opus-4-7 |
