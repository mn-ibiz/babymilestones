# Review findings — P1-E05-S06 (print + SMS-stub receipt from Reception)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `5578cc87`.
HTML escaping sound, audit written, correct stub sender. **Three real bugs fixed.**

## Patched this review
- **[Patch][BLOCKER] Receipt SMS was gated on the MARKETING opt-in** (defaults false), so a
  non-consenting parent who paid and asked for a texted receipt got nothing. Receipts are
  transactional (P1-E02-S04 AC3; the `@bm/sms` `sendTransactional` doc lists receipts as never-gated).
  Fixed `ConsentAwareSmsSender.sendReceipt` to always send; updated the two tests that codified the
  drop. **(Compliance confirm requested — see DECISIONS-NEEDED.)**
- **[Patch][HIGH] IDOR** — `GET /reception/receipt/:id` + `POST …/sms` guarded only `read wallet` /
  `create payment` (both held by `parent`) and loaded the receipt by arbitrary ledger id, so a parent
  could read any receipt's PII and fire a receipt SMS to anyone. Added an `isStaffRole` gate.
- **[Patch][HIGH] Negative receipt amount** — `wallet_ledger.amount` is signed; reprinting a
  debit/refund entry (AC4) rendered a negative line + total. Now `Math.abs` on the receipt amount.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] No idempotency on the SMS send** — a double-click/retry sends duplicate texts +
  duplicate audit rows. Choose: accept resend-as-feature (+ client debounce) or dedup.
- **[Decision] Compliance confirm** — receipt SMS now sends regardless of marketing opt-in. Confirm
  this matches the intended transactional-SMS policy (it follows the platform's own model).

## Deferred / tracked
- **[Defer] RBAC resource mismatch** — guards use `wallet`/`payment`, not the dedicated `receipt`
  resource (reception lacks `create receipt`). Align the matrix deliberately later.

## Dismissed
HTML-escaping sound; phone/name NOT NULL; audit to outbox; correct stub sender.
