-- P1-E04-S05: Paystack webhook (signature + replay protection). One additive-only table.
--
-- `paystack_event` — one row per webhook event Paystack delivers to us. The
-- Paystack event id (`data.id` on the webhook payload, a stable per-event
-- integer Paystack assigns) is stored as the PRIMARY KEY so a re-delivered
-- (replayed) webhook collapses to a single row via ON CONFLICT DO NOTHING —
-- the authoritative replay guard. The wallet credit (P1-E03-S03 `wallet.post`)
-- is keyed off this same id so even a racing re-delivery cannot double-credit.
--
-- The HMAC-SHA512 signature is verified over the RAW request body in the API
-- layer BEFORE this insert; an invalid signature is rejected (401) with zero
-- writes, so only cryptographically-trusted events ever land here. The Paystack
-- SECRET key lives in env only — never in this table.
CREATE TABLE IF NOT EXISTS paystack_event (
  -- The Paystack event id (data.id), stable per event. PRIMARY KEY → UNIQUE:
  -- a replayed delivery of the same event short-circuits to a no-op.
  id            text PRIMARY KEY,
  -- The event type, e.g. `charge.success`. Stored for routing + forensics.
  event         text NOT NULL,
  -- The client `reference` we generated (echoed by Paystack), used to resolve
  -- the originating paystack_transaction row. May be absent on some events.
  reference     text,
  -- The full verified webhook payload, stored verbatim for forensics/replay.
  raw_payload   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Resolve events by the originating transaction reference.
CREATE INDEX IF NOT EXISTS paystack_event_reference_idx
  ON paystack_event (reference);
