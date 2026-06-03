# Review findings — P5-E01-S05 (sensitive flow: discreet billing labels)

Sweep review 2026-06-03. Epic commit. **✅ Works on the wired channels + one patch applied.** AC1–AC3
implemented & tested: receipts (render + receipt-document A4/thermal) and the coaching booking +
reminder SMS substitute a neutral label for the sensitive service name; admin per-service toggle with
a DB CHECK + contract refine that the label is non-empty when enabled.

## Patched this review
- **[Patch][LOW] PATCH nulling the label while discreet billing stays enabled now 400s instead of
  500ing.** `PATCH {discreetBillingLabel:null}` on an already-enabled service passed the contract (which
  can't see stored state), wrote `label=null`, and tripped the `services_discreet_billing_ck` CHECK →
  raw 500. Added a merged stored+patch re-check in the admin route (mirrors the existing age-range
  merged re-check) returning a 400. Regression test added. A privacy feature must never crash-leak.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Discreet billing fails OPEN** — `receiptLineDescription` falls back to the REAL
  `serviceName` when enabled-but-label-empty (test codifies this). The DB CHECK makes that state
  unreachable today, but for a privacy feature the safe default is a generic neutral fallback
  ("Service"), not the sensitive name. Decide the fail-safe behaviour.
- **[Decision][LOW] Substitution is coaching-only, but the column lives on ALL services** — play/class
  (`parents/booking.ts:196`) and salon (`parents/salon.ts:204`) confirmation SMS pass the raw name. An
  admin enabling the toggle on a non-coaching service would leak. Either constrain the toggle to
  `unit='coaching'`, or factor a shared substitution helper used on every name→parent-SMS path.

## Deferred / tracked
- **[Defer][MED] Feedback-invite SMS resolves the real service name with no discreet check**
  (`apps/api/src/feedback.ts`). Not an active leak (feedback wired for salon only today) but a latent
  one when coaching feedback ships — **track against Epic 34 (Feedback Engine).**
- **[Defer][LOW] Reprint re-SMS discreet path is code-correct but untested** — add a reprint test
  seeding a discreet service (mirror `render.test.ts:180`).

## Dismissed
receipt render/booking/reminder substitution (tested); admin toggle RBAC + audit; enabling-without-label 400.
