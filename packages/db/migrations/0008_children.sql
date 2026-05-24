-- P1-E02-S03: children registry. A parent (parents.id FK) owns zero-or-more
-- children. first_name + date_of_birth required; last_name, gender,
-- allergies_notes nullable. archived_at drives soft-delete (never hard-delete,
-- so historical bookings stay intact). Additive-only.
CREATE TABLE IF NOT EXISTS children (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id        uuid NOT NULL REFERENCES parents(id),
  first_name       text NOT NULL,
  last_name        text,
  date_of_birth    date NOT NULL,
  gender           text,
  allergies_notes  text,
  archived_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS children_parent_id_idx ON children (parent_id);
