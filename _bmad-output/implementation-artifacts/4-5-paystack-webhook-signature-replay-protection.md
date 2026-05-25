# Story 4.5: Paystack webhook (signature + replay protection)

Status: done

> Canonical ID: P1-E04-S05 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S05.md

## Story

As the system,
I want to trust Paystack webhooks cryptographically and accept each one only once,
so that wallet top-ups are credited securely and never replayed.

## Acceptance Criteria

1. `POST /webhooks/paystack` verifies `x-paystack-signature` via HMAC-SHA512 with secret; constant-time compare.
2. Invalid signature → 401, no DB writes.
3. `paystack_event.id UNIQUE`; replay → 200 OK, no work.
4. `charge.success` event → `wallet.post(topup)`.

## Tasks / Subtasks

- [x] Task 1: Add `paystack_event` table + migration in `packages/db` (AC: #3)
  - [x] Columns: `id` (UNIQUE PRIMARY KEY, from Paystack event id), `event` type, raw payload, `reference`, timestamps
  - [x] Additive-only migration (`0021_paystack_event.sql`)
- [x] Task 2: Implement signature verification in `packages/payments` (AC: #1, #2)
  - [x] `packages/payments/src/paystack/verify.ts` — HMAC-SHA512 over raw body with secret; timing-safe (constant-time) compare via `crypto.timingSafeEqual`
- [x] Task 3: Implement webhook route in `apps/api` (AC: #1, #2, #3)
  - [x] `apps/api/src/routes/payments/paystack/webhook.ts`; raw body preserved by a route-scoped (encapsulated-plugin) content-type parser; invalid/missing signature → 401 with zero DB writes
  - [x] Insert into `paystack_event` with UNIQUE id (ON CONFLICT DO NOTHING); replay → 200, no further work
- [x] Task 4: Wire `charge.success` to wallet credit (AC: #4)
  - [x] On `charge.success`, call `@bm/wallet.post(topup)` keyed by `paystack_event.id` (amount from our `paystack_transaction` row, never the body); writes `audit_outbox`
- [x] Task 5: Tests (AC: all)
  - [x] Tampered/wrong-secret/missing-signature rejected with 401 and no writes; valid replay 5× returns 200 with exactly one ledger entry; `charge.success` credits exactly once keyed by event id (vitest, test-first)

## Dev Notes

- Signature verification lives in `packages/payments/paystack/verify.ts` using a timing-safe compare (e.g. `crypto.timingSafeEqual`). Verify HMAC-SHA512 over the raw request body — ensure the Fastify route preserves the raw body for the webhook path.
- Replay protection via `paystack_event.id UNIQUE`: a duplicate event must short-circuit to 200 OK with no ledger work. Crediting uses `packages/wallet` keyed by the event id so re-delivery cannot double-credit.
- This webhook is the authoritative credit path for S04's card top-ups.

### Project Structure Notes
- New: `packages/db` table `paystack_event` + migration; `packages/payments/src/paystack/verify.ts`; `apps/api/src/routes/webhooks/paystack.ts`.
- Reuses `@bm/wallet` credit primitives. Audited actions write to `audit_outbox`.
- Depends on S04.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E04]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm test && pnpm typecheck && pnpm lint && pnpm build` — all green from repo root.
- Targeted: `packages/payments` verify (7 tests), `apps/api` webhook integration (9 tests).

### Completion Notes List

- Signature is verified over the RAW body BEFORE any DB access; invalid/missing/tampered/wrong-secret → 401 with zero writes (AC1, AC2). Constant-time compare via `crypto.timingSafeEqual` with a length pre-check (avoids the throw on unequal lengths).
- Fastify discards the raw body by default; the webhook is registered inside an **encapsulated plugin** with a `parseAs: "buffer"` `application/json` content-type parser that stashes `req.rawBody` and still JSON-parses for the handler. Scoping it to the plugin keeps every other route on the default JSON parser (verified: the M-Pesa JSON callback and all other suites stay green).
- Replay is guarded twice: `paystack_event.id` PRIMARY KEY (`ON CONFLICT DO NOTHING` → a re-delivery returns no row and short-circuits) AND the wallet ledger `idempotency_key` UNIQUE keyed by the same event id. Replay 5× → exactly one ledger credit (AC3).
- `charge.success` credits via `@bm/wallet.post` keyed by the event id, using the amount from OUR `paystack_transaction` row (never the untrusted body), advances the txn to `SUCCEEDED`, and audits `payment.paystack.webhook.credited` (AC4). An unknown reference is recorded + audited (`...orphan`) but credits nothing.

### File List

- `packages/db/migrations/0021_paystack_event.sql` (new)
- `packages/db/src/schema/paystack.ts` (modified — `paystackEvents` table + row types)
- `packages/payments/src/paystack/verify.ts` (new)
- `packages/payments/src/paystack/verify.test.ts` (new)
- `packages/payments/src/index.ts` (modified — export `verifyPaystackSignature`)
- `apps/api/src/routes/payments/paystack/webhook.ts` (new)
- `apps/api/src/routes/payments/paystack/webhook.test.ts` (new)
- `apps/api/src/routes/payments/paystack/index.ts` (modified — register webhook)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented Paystack webhook: HMAC-SHA512 raw-body verify (constant-time), `paystack_event` replay guard, `charge.success` → wallet credit keyed by event id. Test-first; full gate green. | claude-opus-4-7 |
