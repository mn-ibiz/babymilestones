# Review findings — 11-3-top-up-flow-from-dashboard (P1-E11-S03)

Single self-review of the diff. No BLOCKER/high-severity findings. The items
below are low-severity follow-ups — logged, not acted on (no second review).

## Low severity

1. **Shared remediation helper not yet consumed by the async forms.**
   `failureRemediation(method)` in `lib/topup-flow.ts` is a tested pure helper for
   AC4 copy, but `TopUpForm.tsx` (M-Pesa) and `PaystackTopUpForm.tsx` /
   `PaystackReturn.tsx` (card) still render their own inline failure copy from the
   epic-4 implementation. Behaviour is correct and AC4 is satisfied; a future
   refactor could route those components through the shared helper for a single
   source of remediation copy.

2. **Bank account details are hard-coded constants.**
   `BANK_TRANSFER_INSTRUCTIONS` is a literal in `lib/topup-flow.ts`. If the
   destination account ever becomes tenant-/env-configurable, lift it to config
   (e.g. `@bm/config` or an env-backed contract). Not needed for P1 single-tenant.
