# Review findings — P3-E03-S03 (salon counter check-in + service completion)

Sweep review 2026-06-03. Epic-level commit. Idempotent wallet debit (`attendance:checkin:<id>`, FOR
UPDATE + unique backstop); commission accrual idempotent; double-completion guard (FOR UPDATE re-check
of `completedAt`); consent-gated photo. AC1–AC4 tested. **Fixed a BLOCKER IDOR.**

## Patched this review
- **[Patch][BLOCKER] Salon counter routes missing the `isStaffRole` gate** — the LAST reception
  surface without it. Board/check-in/complete gated only on `read wallet`/`create payment` (both held
  by `parent`, shared session) with no caller scope → a parent could check in/debit any family's salon
  booking and enumerate every family's children for a day. Added the `isStaffRole` gate to `authStaff`
  (`reception/salon.ts`). api salon(33) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH · money] Reassign commission silently dropped when the prior stylist's net is 0**
  (0%-rate stylist) — see the consolidated commission-reassign decision (S04). The new stylist is
  under-paid because `priorHolders.length===0` is misread as a replay.

## Deferred / tracked
- **[Defer] Walk-in strands parent/wallet/child rows** if booking/check-in fails after the parent commit
  (no money lost; retry 409s on duplicate phone).

## Dismissed
idempotent debit; commission accrual onConflictDoNothing; double-completion guard; reassign atomicity (savepoint).
