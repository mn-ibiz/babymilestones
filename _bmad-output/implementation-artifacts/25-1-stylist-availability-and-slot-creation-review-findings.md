# Review findings — P3-E03-S01 (stylist availability + slot creation)

Sweep review 2026-06-03. Epic-level commit. Data model (additive migration 0088 + CHECKs), nightly
generation cron, and the no-retroactive-change invariant are solid & tested.

## Patched this review
- **[Patch][LOW] Resync wrongly protects cancelled-booking slots.** `deleteFutureUnbookedSalonSlots`
  filtered only `isNotNull(salonSlotId)`, so a cancelled booking's slot survived a resync and kept
  being offered to parents even after the stylist's availability no longer covered it. Added
  `ne(status,'cancelled')` to match the browse subquery. catalog salon(50) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] No admin/staff route to declare availability** — `createStaffAvailability` etc. have
  ZERO non-test callers; the story's JTBD ("admin declares which stylist is in") has no HTTP surface,
  no zod validation, and the implied authz boundary is unexercised. Confirm deferred-to-UI, or add the route.

## Deferred / tracked
- **[Defer] Cron `fromDate` is UTC date** in an EAT deployment (self-healing, additive; systemic).

## Dismissed
slot-time TZ model (intended/consistent); ad-hoc unique-index NULL behavior (correct for walk-ins).
