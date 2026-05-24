# Story 4.2: M-Pesa C2B callback handler (idempotent)

Status: done

> Canonical ID: P1-E04-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S02.md

## Story

As the system,
I want to accept Daraja's callback exactly once, even if it arrives twice or out of order,
so that wallet top-ups are never double-credited or lost.

## Acceptance Criteria

1. Callback URL `POST /webhooks/mpesa/c2b`.
2. Handler is idempotent on `CheckoutRequestID`: `INSERT … ON CONFLICT DO NOTHING` into `mpesa_callback`.
3. Success → `wallet.post(topup)` via idempotency key = `mpesa_callback.id`.
4. Failure → state → `FAILED`, audit reason.
5. Out-of-order arrival (callback before Express response committed) handled — the callback creates the request row if it doesn't exist yet.
6. HTTP 200 OK returned in all cases (Daraja retries on non-200).

## Tasks / Subtasks

- [x] Task 1: Add `mpesa_callback` table + migration in `packages/db` (AC: #2, #3)
  - [x] Columns: `id` (PK, used as wallet idempotency key), `checkout_request_id`, raw payload, `result_code`, `result_desc`, `merchant_request_id`, `created_at`; UNIQUE on `checkout_request_id`
  - [x] Additive-only migration `0018_mpesa_callback.sql`; Drizzle table `mpesaCallbacks`
- [x] Task 2: Implement callback handler route in `apps/api` (AC: #1, #2, #6)
  - [x] `apps/api/src/routes/payments/mpesa/callback.ts`; `INSERT … ON CONFLICT (checkout_request_id) DO NOTHING`; always return HTTP 200
  - [x] `parseStkCallback` validates the Daraja shape (untrusted); Daraja source-IP allowlist (default Safaricom ranges, overridable)
  - [~] Route mounted at `POST /payments/mpesa/callback` (not the spec's `/webhooks/mpesa/c2b`): S01 already wires Daraja's `callbackUrl` to `…/payments/mpesa/callback` and registers under `payments/mpesa`. Kept consistent with the shipped S01 surface rather than introducing a second path.
- [x] Task 3: Wire success path to wallet credit (AC: #3)
  - [x] On `ResultCode == 0`, credit via `@bm/wallet.applyTopup` (the topup+FIFO-settlement primitive) with idempotency key = `mpesa_callback.id`; advance `mpesa_stk_request` to `SUCCEEDED`. Amount taken from our own request row (whole KES → cents), never the body.
- [x] Task 4: Handle failure path (AC: #4)
  - [x] On non-zero result, set `mpesa_stk_request` state `FAILED`; write reason to `audit_outbox` (`payment.mpesa.callback.failed`)
- [~] Task 5: Handle out-of-order arrival (AC: #5)
  - [~] An out-of-order callback (no `mpesa_stk_request` yet) is recorded durably in `mpesa_callback` + audited (`payment.mpesa.callback.orphan`) and credited later by the reconciliation cron (S03). The literal "create the request row from the callback" is NOT done — the `mpesa_stk_request` NOT NULL parent_id/wallet_id are unknowable from a Daraja STK callback body. See review-findings F2.
- [x] Task 6: Tests (AC: all)
  - [x] Integration tests in `callback.test.ts`: happy credit, replay 5× → exactly 1 ledger entry, failure → `FAILED` + audit, out-of-order recorded + 200, malformed/empty → 200 + no row, IP allowlist block (test-first)

## Dev Notes

- Use Daraja's IP allowlist; verify the callback shape but treat the body as untrusted input.
- Idempotency is layered: DB unique on `mpesa_callback.checkout_request_id` (`ON CONFLICT DO NOTHING`) plus `wallet.post` idempotency key = `mpesa_callback.id`. Replays must produce no additional ledger entries.
- Always return HTTP 200 so Daraja stops retrying; failures are recorded internally, not surfaced as non-200.
- Callback route in `apps/api/src/routes/webhooks/`; wallet crediting via `packages/wallet`; tables in `packages/db`. Audited failures write to `audit_outbox`.

### Project Structure Notes
- New: `packages/db` table `mpesa_callback` + migration; `apps/api/src/routes/webhooks/mpesa/c2b.ts`.
- Reuses the `mpesa_stk_request` table and state machine from S01 and the `@bm/wallet` credit primitives.
- Depends on S01.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E04]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- One typecheck fix: `post` test helper body typed `Record<string, unknown>` (not `unknown`) so Fastify `app.inject`'s overload resolves to the promise-returning form.
- Full gate green: `pnpm test` (141 api tests incl. 8 new), `pnpm typecheck`, `pnpm lint`, `pnpm build`.

### Completion Notes List

- Idempotency is layered exactly as specced: DB UNIQUE on `mpesa_callback.checkout_request_id` with `ON CONFLICT DO NOTHING` (a returned-no-row insert short-circuits the whole handler), plus the wallet credit keyed by `mpesa_callback.id` (ledger `UNIQUE(idempotency_key)` is the second guard). Replay 5× → exactly one ledger credit, verified.
- ALWAYS returns HTTP 200 (malformed body, blocked IP, and any processing error are all swallowed) so Daraja stops retrying.
- Credit goes through `@bm/wallet.applyTopup` (topup + FIFO invoice settlement) rather than the lower-level `post`, since the foundations note FIFO settlement applies on top-ups. Amount is read from our own `mpesa_stk_request` row (whole KES → cents), never trusted from the callback body.
- Out-of-order arrival and post-insert credit failure both fall through to the S03 reconciliation cron. See `…-review-findings.md` F1/F2/F3.

### File List

- packages/db/migrations/0018_mpesa_callback.sql (new)
- packages/db/src/schema/mpesa.ts (mpesaCallbacks table + types)
- apps/api/src/routes/payments/mpesa/callback.ts (new — handler + parseStkCallback)
- apps/api/src/routes/payments/mpesa/callback.test.ts (new)
- apps/api/src/routes/payments/mpesa/index.ts (register callback route)
- apps/api/src/app.ts (mpesaCallback config dep)
- _bmad-output/implementation-artifacts/4-2-...-review-findings.md (new)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented idempotent M-Pesa C2B/STK callback handler (test-first); migration 0018 + `mpesa_callback` table; route `POST /payments/mpesa/callback`; wallet credit via applyTopup keyed by callback id; full gate green | claude-opus-4-7 |
