-- P2-E03-S01: authorised pickup list per child. Additive-only.
--
-- A parent nominates who may collect a child (AC1): each row is one authorised
-- person with a display `name`, a contact `phone`, an optional `photo_url`, and
-- their `relationship` to the child (e.g. "Aunt", "Nanny"). The attendant reads
-- this list at hand-off so a collection is known-safe (P2-E03-S02/S03).
--
-- The parent CRUDs the list from the dashboard (AC2); ownership is enforced at
-- the API edge (the child must belong to the session parent). Every create /
-- edit / delete is audited to `audit_outbox` (AC3) by the route.
CREATE TABLE IF NOT EXISTS child_pickup_authorisations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id      uuid NOT NULL REFERENCES children(id),
  -- Display name of the authorised person (required).
  name          text NOT NULL,
  -- Contact phone for the authorised person (required). Free-form: a pickup
  -- person is not a system user, so this is NOT a normalised +2547… login phone.
  phone         text NOT NULL,
  -- Optional photo of the authorised person, shown on the attendant screen.
  photo_url     text,
  -- Relationship to the child (required), e.g. "Aunt", "Grandparent", "Nanny".
  relationship  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Per-child list scan (the attendant + the parent dashboard both read by child).
CREATE INDEX IF NOT EXISTS child_pickup_authorisations_child_id_idx
  ON child_pickup_authorisations (child_id);
