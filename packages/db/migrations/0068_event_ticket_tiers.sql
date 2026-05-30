-- 0068_event_ticket_tiers.sql
-- Story 30-1: Event creation — pricing tiers per event.
-- A tier has a price (price_cents=0 => free RSVP), an allotment (max sellable
-- against this tier) and an optional sale window.

CREATE TABLE IF NOT EXISTS event_ticket_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  allotment INTEGER NOT NULL,
  sale_starts_at TIMESTAMPTZ,
  sale_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_ticket_tiers_price_chk CHECK (price_cents >= 0),
  CONSTRAINT event_ticket_tiers_allotment_chk CHECK (allotment >= 0)
);

CREATE INDEX IF NOT EXISTS event_ticket_tiers_event_idx ON event_ticket_tiers(event_id);
