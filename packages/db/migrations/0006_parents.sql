-- P1-E02-S01: parent profile. One profile per user (FK + UNIQUE on user_id;
-- no joint accounts in v1). Names required; email + residential area nullable
-- free text. Additive-only.
CREATE TABLE IF NOT EXISTS parents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL UNIQUE REFERENCES users(id),
  first_name       text NOT NULL,
  last_name        text NOT NULL,
  email            text,
  residential_area text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
