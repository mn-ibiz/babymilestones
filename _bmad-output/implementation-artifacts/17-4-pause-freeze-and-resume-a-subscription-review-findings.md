# Review findings — P2-E02-S04 (pause/freeze and resume a subscription)

Sweep review 2026-06-03. Commit `ecb8b0af`. State machine sound (pause requires active, resume
requires paused, no resume-of-cancelled, idempotent 409s, ms-based period shift, entitlement frozen,
in-tx audit). **Fixed a HIGH IDOR.**

## Patched this review
- **[Patch][HIGH] Parent IDOR/privesc on the reception pause/resume route.**
  `POST /reception/subscriptions/:id/{pause,resume}` gated only on `create payment` (held by parents,
  shared session store) with NO ownership check → a parent could pause/resume ANY family's
  subscription (grief: freeze entitlement, shift billing dates). Added the `isStaffRole` gate the
  sibling routes already use (also fixed the reception booking-cancel route with the same hole).
  reception(13) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] AC1 "admin" pause/resume path is unreachable** — the route gates on `create
  payment`, which the `admin` role does NOT hold (only reception/cashier/super_admin). isStaffRole
  doesn't fix this. Decide the correct gate (drop "admin" from AC1, or add a `manage subscription` perm).

## Dismissed
Speculative clock-skew negative pause; missing S06 cancel actions in catalogue (audit doesn't validate).
