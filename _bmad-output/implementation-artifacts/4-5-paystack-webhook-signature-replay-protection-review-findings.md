# Review findings — P1-E04-S05 (Paystack webhook — signature + replay protection)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `78d225ea`.
**Security core is solid:** HMAC-SHA512 over the RAW body, `timingSafeEqual` constant-time compare,
verified BEFORE any DB write (tampered/wrong-secret/missing → 401, zero writes); credit uses OUR
`paystack_transaction` amount, idempotency double-guarded (event PK + ledger UNIQUE). AC1–AC4 tested.

## Patched this review
- **[Patch][MED→min] Swallowed processing errors made a lost credit invisible.** Added
  `req.log.error({ err }, …)` in the webhook catch so a failed credit is at least observable (the
  handler still returns 200 to stop Paystack retries). `apps/api/.../paystack/webhook.ts`. Tests green.

## Decision needed (collected — see DECISIONS-NEEDED.md)
- **[Decision][HIGH] No recovery path for a paid-but-uncredited top-up.** The event-row insert and
  the wallet credit are separate, non-atomic commits, and there is **no Paystack reconcile cron**
  (M-Pesa has one). A crash between commits, or a charge.success whose `reference` row doesn't exist
  yet (orphan), leaves a paid top-up permanently uncredited — a re-delivery short-circuits on the
  event row. **Recommend:** add a Paystack reconcile cron mirroring `mpesa-reconcile.ts` (+ write a
  failure audit row alongside the new error log).
- **[Decision][MED] Replay dedup keyed on `data.id` alone, not `(event, data.id)`.** A second event
  *type* reusing the same transaction id is silently dropped. Only `charge.success` credits today, so
  wallet blast radius is small, but non-credit events are lost from the forensic record. Choose the
  dedup grain.

## Deferred / tracked
- **[Defer] Post-credit txn-state update + audit are non-atomic with the credit** (money correct;
  consistency/audit gap; same shape as M-Pesa).

## Dismissed
RAW-body parser scoping correct; amount from our row; idempotency double-guard; signature-first ordering.
