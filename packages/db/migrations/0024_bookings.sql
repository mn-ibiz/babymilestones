-- P1-E05-S04: record a service visit. Additive-only.
--
-- A `booking` is the durable record that a child attended a service, attributed
-- to a staff member, with the staff name + rate SNAPSHOTTED onto the row so a
-- later staff/rate change never rewrites visit history (AC2). Confirming a visit
-- creates one booking + one invoice and immediately checks the child in (the
-- wallet debit follows P1-E03-S05 against that invoice).
--
-- The services + staff catalogues are a later epic (P1-E07), so `service_id` and
-- `staff_id` are nullable uuids with NO FK yet (forward-compatible — the FKs land
-- with P1-E07). The reception flow accepts the ids + the snapshot fields directly
-- for now; DEFERRED: wire the FKs + active-only catalogue loads when P1-E07 ships.
CREATE TABLE IF NOT EXISTS bookings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id            uuid NOT NULL REFERENCES parents(id),
  child_id             uuid NOT NULL REFERENCES children(id),
  -- Booked service (P1-E07 catalogue — nullable uuid, no FK yet).
  service_id           uuid,
  -- Attributed staff member (P1-E07 staff records — nullable uuid, no FK yet).
  staff_id             uuid,
  -- Snapshots (AC2): the staff member's display name + service rate (integer
  -- cents) captured at confirm time so history is immutable to later edits.
  staff_name_snapshot  text NOT NULL,
  staff_rate_snapshot  bigint NOT NULL CHECK (staff_rate_snapshot >= 0),
  -- The invoice raised for this visit (1:1). FK to invoices(id).
  invoice_id           uuid NOT NULL REFERENCES invoices(id),
  -- P1 records arrivals only (no double-booking / time-slot check — that's P2).
  -- A visit is created already checked-in (AC3), so this is set at confirm time.
  checked_in_at        timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Recent-visits / per-parent history scan, newest first.
CREATE INDEX IF NOT EXISTS bookings_parent_id_created_at_idx
  ON bookings (parent_id, created_at);

-- One booking per invoice (the visit ↔ invoice link is 1:1).
CREATE UNIQUE INDEX IF NOT EXISTS bookings_invoice_id_uniq
  ON bookings (invoice_id);
