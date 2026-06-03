# Review findings — P5-E04-S01 (0–5 rating after every paid touchpoint)

Sweep review 2026-06-03. Epic commit. **Two patches applied.** Core is sound: invitation idempotent on
`(source_type, source_id)`, submit-once with a row lock + ownership check, 0–5 + 200-char validation,
parent-scoped read/write (no IDOR). AC2/AC3 tested.

## Patched this review
- **[Patch][HIGH] feedback.invite SMS leaked the real service name — fixed (resolves the Epic 31 deferred
  item).** The invite hook selected raw `services.name` with no discreet check, so a discreet-billing
  service spelled out the real sensitive name on the parent's phone — the exact leak Epic 31 exists to
  prevent (a test even asserted `toContain('Kids Cut')`). Now applies the same substitution as the
  coaching SMS (`discreetBillingEnabled && label ? label : name`). New test asserts the neutral label,
  not the real name. api feedback(10) green.
- **[Patch][HIGH] `attributed_staff_id` was never populated for salon feedback — fixed.** The
  `SalonFeedbackHook` event carried no `staffId`, so the ONLY wired touchpoint always wrote a NULL staff
  — blinding the per-staff dashboard (S02) and staff-attributed alerts (S03) for all real feedback.
  Threaded `booking.staffId` through the hook event → `attributedStaffId`. Test now asserts the created
  row's `attributedStaffId` equals the booking's stylist. catalog salon+feedback(54) green.
- **[Patch][LOW] Drizzle schema index now matches the migration's partial predicate**
  (`feedback_parent_pending_idx … WHERE submitted_at IS NULL`) — closes a drizzle-kit diff hazard.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] AC1 only wires the salon checkout touchpoint** — play pickup, talent class end,
  coaching/doula session end, and order-fulfilled never create invitations (the reusable creator exists
  but is called only by the salon hook). Either descope AC1 to "salon first + follow-ups" or wire the
  other four completion paths.

## Dismissed
IDOR (parent-scoped); submit-once row lock; 0–5 + 200-char validation; comment JS-length vs char_length (JS more conservative).
