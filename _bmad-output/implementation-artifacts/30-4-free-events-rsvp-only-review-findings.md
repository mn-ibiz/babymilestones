# Review findings — P4-E05-S04 (free events — RSVP only)

Sweep review 2026-06-03. Epic-level commit. Free path correct on the no-payment concern (rejects paid
tiers, issues immediately at amount_cents=0, no provider call); input validation solid. AC1–AC3 tested.
No code change (findings shared with S03 / collected).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] RSVP capacity race** — `committedSeats` is computed BEFORE the tx with no tier
  row lock → concurrent RSVPs overbook a free event (people turned away at the door). Same FOR UPDATE
  tier-lock fix as the S03 checkout. `tickets.ts:260-263`.
- **[Decision][MED] No duplicate-RSVP guard** — the unauthenticated endpoint lets one phone grab up to
  20 free seats per call, repeatedly, until the tier is drained. Choose one-RSVP-per-(tier,phone) / a
  per-phone cap / rate limiting.

## Deferred / tracked
- **[Defer] RSVP SMS-stub send failure swallowed** with no observability.

## Dismissed
free-order double-count in committedSeats; confirm-on-free-order; email validation.
