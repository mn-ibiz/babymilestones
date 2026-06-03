# Review findings — P3-E03-S02 (parent picks service → stylist → slot)

Sweep review 2026-06-03. Epic-level commit. **Money/concurrency SOUND:** slot `SELECT … FOR UPDATE`
(capacity-1, 409 on race); IDOR enforced (own child, 404); price snapshot via `resolveServicePriceAt`;
commission attributes to `booking.staffId`. AC1/AC2/AC4 tested. No code change (findings are decisions).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] A past-dated salon slot is bookable** — no `slotDate >= today` guard in
  `bookSalonSlot`/confirm; past slots are never pruned, so a stale/crafted slotId yields a confirmed
  booking + invoice for an elapsed date. (Booking Engine has an `isSlotPast` guard; salon lacks it.)
- **[Decision][MED] AC3 least-busy not server-enforced on confirm** — least-busy is advisory via a
  separate GET; confirm books whatever slot the client passes, and the route's doc-comment falsely
  claims the server resolves it. Enforce server-side or fix the comment + AC.

## Deferred / tracked
- **[Defer] Reassign commission move has no DB-level idempotency backstop/lock** — safe only via the
  caller's booking `FOR UPDATE`; latent if ever called standalone.

## Dismissed
FOR UPDATE race; IDOR; price snapshot; commission attribution — all verified correct.
