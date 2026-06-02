-- P5-E01-S04 (Story 31.4): Coach session notes — PRIVATE. Additive-only.
--
-- After a coaching session check-out, Reception (or an admin acting for the coach)
-- records PRIVATE notes per parent/session (AC1). The notes are SENSITIVE coaching
-- content, so they are:
--   - ENCRYPTED AT REST, column-level (Dev Note): `note_enc` holds the AES-256-GCM
--     `v1:salt:iv:tag:ciphertext` envelope produced by `@bm/woocommerce`
--     `encryptSecret` (the same scrypt-derived-key + random-salt/IV + GCM-tag scheme
--     used for the Woo consumer secrets). Plaintext NEVER touches a column.
--   - Visible to ADMIN and the named coach only, scoped to that coach's own records
--     (AC2). The coach has NO login (the P3-E02 named viewer is unauthenticated), so
--     decrypted CONTENT is reachable ONLY through the authenticated admin/reception
--     path — the public coach surface returns a non-sensitive SUMMARY (counts/dates)
--     and never the note text.
--   - NEVER shown to parents (AC3) — there is no parent-app surface for this table.
--   - Retained 24 months then anonymised (AC4) — the existing Decision-29
--     anonymisation worker NULLs `note_enc` + the owner ids in place and stamps
--     `anonymised_at`, mirroring the `observations` retention shape.
--
-- One new table. A note is keyed to the coaching BOOKING (the session) — the natural
-- check-out anchor — plus the parent + coach for scoping.
CREATE TABLE IF NOT EXISTS coaching_session_notes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The coaching session the note belongs to (one booking = one 1:1/group seat).
  booking_id         uuid NOT NULL REFERENCES bookings(id),
  -- Denormalised owner ids so the 24-month anonymisation job can NULL them in place.
  -- The coach is the staff member the note is scoped to (AC2).
  parent_id          uuid REFERENCES parents(id),
  staff_id           uuid REFERENCES staff(id),
  -- Coach display-name snapshot (history-stable attribution, like bookings).
  staff_name_snapshot text,
  -- AES-256-GCM `v1:...` envelope of the private note (column-level encryption).
  -- NULLed by the S05-style anonymisation job once the row is past retention.
  note_enc           text,
  -- Acting user who recorded the note (Reception / admin actor).
  created_by         uuid REFERENCES users(id),
  -- Set by the 24-month anonymisation job once the encrypted note + PII are cleared.
  anonymised_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Scope lookups: a coach's own notes by recency (AC2), and a session's notes.
CREATE INDEX IF NOT EXISTS coaching_session_notes_staff_id_created_at_idx
  ON coaching_session_notes (staff_id, created_at);
CREATE INDEX IF NOT EXISTS coaching_session_notes_booking_id_idx
  ON coaching_session_notes (booking_id);
-- Age scan for the 24-month retention/anonymisation job (AC4).
CREATE INDEX IF NOT EXISTS coaching_session_notes_created_at_idx
  ON coaching_session_notes (created_at);
