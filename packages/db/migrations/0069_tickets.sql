-- 0069_tickets.sql
-- Story 30-3 / 30-4: Guest ticket checkout & free RSVP (Epic 30).
-- ticket_orders: one per guest checkout/RSVP (buyer name/phone/email, no account).
-- tickets: one row per seat with a unique door code (used by 30-5 check-in).

CREATE TABLE IF NOT EXISTS ticket_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES event_ticket_tiers(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  buyer_email TEXT,
  quantity INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  payment_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ticket_orders_quantity_chk CHECK (quantity > 0),
  CONSTRAINT ticket_orders_amount_chk CHECK (amount_cents >= 0),
  CONSTRAINT ticket_orders_status_chk CHECK (status IN ('pending', 'paid', 'free', 'cancelled')),
  CONSTRAINT ticket_orders_provider_chk CHECK (provider IS NULL OR provider IN ('mpesa', 'paystack'))
);

CREATE INDEX IF NOT EXISTS ticket_orders_event_id_idx ON ticket_orders(event_id);
CREATE INDEX IF NOT EXISTS ticket_orders_payment_reference_idx ON ticket_orders(payment_reference);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  order_id UUID NOT NULL REFERENCES ticket_orders(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES event_ticket_tiers(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  buyer_email TEXT,
  status TEXT NOT NULL DEFAULT 'issued',
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tickets_status_chk CHECK (status IN ('issued', 'checked_in', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS tickets_event_id_idx ON tickets(event_id);
CREATE INDEX IF NOT EXISTS tickets_tier_id_idx ON tickets(tier_id);
CREATE INDEX IF NOT EXISTS tickets_order_id_idx ON tickets(order_id);
