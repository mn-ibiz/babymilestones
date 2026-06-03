# Review findings — P2-E03-S03 (pickup handoff with free-text observations)

Sweep review 2026-06-03. Commit `6b3fad30` (epic-level). XSS-safe (React JSX escaping; note ≤280
server-side; SMS plaintext); atomic checkout+observation+receipt+audit. AC1–AC4 tested. **Fixed an
IDOR on a child-safety action.**

## Patched this review
- **[Patch][HIGH] Hand-off gated only on `create payment`** (held by parents, shared session) with no
  ownership scope → a logged-in parent could record a hand-off on ANY booking. Added the `isStaffRole`
  gate to the handoff `authStaff` (`reception/handoff.ts`). api(48) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED · child-safety] Hand-off never verifies the collector against the authorised-pickup
  list (S01) nor records WHO collected the child** — only who released. The epic is "Pickup
  Authorisation", but the authoritative list is unused at hand-off. Decide whether to require/record
  the collector.

## Deferred / tracked
- **[Defer] `activities` accepted as arbitrary free text**, not constrained to the configured chip list
  (renders safely; data-fidelity only).

## Dismissed
XSS (JSX escaping, no dangerouslySetInnerHTML); validation (mood enum, note≤280); narrow conflict matcher; additive migration.
