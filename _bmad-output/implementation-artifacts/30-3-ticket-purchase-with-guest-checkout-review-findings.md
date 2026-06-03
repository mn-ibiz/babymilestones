# Review findings — P4-E05-S03 (ticket purchase with guest checkout)

Sweep review 2026-06-03. Epic-level commit. Server-computed amount + crypto-random ticket codes are
correct. No code change — **two BLOCKERs need a cohesive ticketing rework (collected, not auto-fixed)**.

## Decision needed (see DECISIONS-NEEDED.md — ⚠️ BLOCKERS)
- **[Decision][BLOCKER · money/security] Paid tickets are issued with NO payment.**
  `POST /public/ticket-orders/:id/confirm` is PUBLIC + unauthenticated, takes a client-supplied
  `paymentReference`, invokes no M-Pesa/Paystack, verifies no settled amount, and flips the order to
  `paid` + issues tickets + texts the e-ticket. The order id is returned by `/checkout`, so anyone can
  self-issue free "paid" tickets. The dev notes claim it reuses `@bm/payments` — the code does NOT.
  **Fix:** initiate STK/Paystack on `/checkout`; issue tickets only from the IP-allowlisted M-Pesa
  callback / HMAC-verified Paystack webhook, matching a server-stored reference + verifying the amount,
  idempotent on the reference. `apps/api/src/routes/public/tickets.ts:167-240`.
- **[Decision][BLOCKER · capacity] Oversell race** — `committedSeats` is an unlocked read then a
  separate insert (not even in a tx for checkout). Concurrent last-seat buyers both pass and oversell.
  **Fix:** `SELECT … FOR UPDATE` on the tier row inside one tx, recount, then insert (apply to checkout
  AND the S04 RSVP path). `tickets.ts:63-73,133-163,260-304`.

## Deferred / tracked
- **[Defer] Abandoned pending orders hold seats forever** (no TTL/reaper → phantom sell-out).
- **[Defer] Ticket-code unique-collision not retried; tier sale window ignored.**

## Dismissed
server-computed amount; crypto-random unguessable codes; guest input validation.
