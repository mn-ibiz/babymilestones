-- 0067_events.sql
-- Story 30-1: Event creation (Epic 30 — Events & Recital Ticketing)
-- Events: admin-created happenings (reading corner, talent recital, general)
-- with a date/time window, venue and overall capacity.

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'general',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  venue TEXT,
  capacity INTEGER NOT NULL,
  published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  -- unit is one of: reading_corner | talent_recital | general
  CONSTRAINT events_unit_chk CHECK (unit IN ('reading_corner', 'talent_recital', 'general')),
  CONSTRAINT events_capacity_chk CHECK (capacity >= 0),
  CONSTRAINT events_window_chk CHECK (ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events(starts_at);
CREATE INDEX IF NOT EXISTS events_published_idx ON events(published);
