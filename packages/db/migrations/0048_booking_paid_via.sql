-- P2-E02-S03: how a booking was paid. Additive.
--
-- A booking either consumes subscription entitlement ('subscription') or is
-- billed pay-as-you-go to the wallet ('wallet', the default + all existing P1/P2
-- arrivals). A subscription booking raises a zero-amount settled invoice (the
-- entitlement covered it); a wallet booking raises the usual pending invoice.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS paid_via text NOT NULL DEFAULT 'wallet'
  CHECK (paid_via IN ('wallet', 'subscription'));

-- The subscription whose entitlement a 'subscription' booking consumed, so a
-- cancellation can refund that unit (P2-E02-S03/S06). NULL for wallet bookings.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES subscriptions(id);
