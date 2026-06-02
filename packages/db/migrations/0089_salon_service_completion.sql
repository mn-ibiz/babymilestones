-- P3-E03-S03 (Story 25.3): Salon counter check-in & service completion.
-- Additive-only. The salon counter REUSES the existing `attendances` row (one per
-- booking) that the P2-E03-S02 check-in already records — a salon booking is
-- checked in via the same `checkInBooking` path (wallet debit + commission +
-- attendance row). This migration adds the SERVICE-COMPLETION columns onto that
-- same attendance row so a completed salon visit is a distinct, later state from
-- the check-in (AC3), without a new table.
--
--  - `completed_at`  — when the stylist marked the service complete (AC3). Null
--                      until completed. Distinct from `checked_out_at` (the
--                      crèche hand-off, S03) — a salon visit completes, it is not
--                      handed-over to a parent at pickup.
--  - `completed_by`  — acting staff user id who marked it complete.
--  - `photo_ref`     — optional reference (object-store key / id) to the photo
--                      captured at completion. Only set when the child's
--                      `photo_consent` flag is true (AC3 — consent-gated); stays
--                      NULL otherwise. No photo-storage engine is built here; the
--                      column records the reference the capture surface supplies.

ALTER TABLE attendances ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS completed_by uuid;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS photo_ref text;
