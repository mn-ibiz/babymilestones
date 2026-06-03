# Review findings — P3-E04-S01 (proportional loyalty clawback on refund)

Sweep review 2026-06-03. Epic-level commit. Proportional integer math (`loyaltyClawbackPoints`,
round-half-up, clamped) is correct & tested; reversing-entry shape (append-only,
`reverses_loyalty_ledger_id`, `negative_carry`) satisfies AC2–AC5 in isolation. No code change —
findings fold into the P3-E04-wiring + dual-schema decisions.

## Decision needed (see DECISIONS-NEEDED.md — consolidated P3-E04)
- **[Decision][HIGH] Clawback primitive is never invoked** — `refund()` sets `loyaltyClawbackPending`
  but nothing consumes it / calls `clawbackForRefund`. AC1 doesn't fire in production.
- **[Decision][HIGH] When wired, the clawback primitive needs hardening:** (a) write the
  `loyalty.clawback` `audit_outbox` row (registered action, currently absent); (b) DB-level idempotency
  (idempotency_key / partial unique index) + a transaction — current SELECT-then-INSERT can double-claw;
  (c) claw against *remaining-clawable* points so many partial refunds don't under-claw (rounding drift).

## Dismissed
sumPendingClawback ignores negatives (SQL SUM nets them); release-path netting replay-safe; dead-defensive negative guard.
