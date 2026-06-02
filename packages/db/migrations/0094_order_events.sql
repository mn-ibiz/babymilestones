-- P4-E04-S02 (Story 29.2): the audit-grade local order-status transition log.
-- Additive-only. Every POS workflow transition on a WooCommerce order writes one
-- `order_events` row (the durable, local record of WHO moved the order from WHICH
-- status to WHICH, WHEN, and WHY) BEFORE the Woo writeback is enqueued. The Woo
-- writeback is the queued side-effect (wc_outbox, Story 29.7); this row stands
-- regardless of whether the writeback ever succeeds (AC6 — no rollback on Woo
-- failure).
--
-- This is the forensic source of truth for the in-store fulfilment workflow,
-- distinct from `audit_outbox` (which carries the coarse action stream): here we
-- keep the from/to statuses + the dispatch metadata (rider/vehicle/contact/time —
-- AC5) so a dispatched order's courier details survive even if the Woo note write
-- is delayed or dead-lettered.

CREATE TABLE IF NOT EXISTS order_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The WooCommerce order id this event concerns (FK-by-convention to wc_orders;
  -- not a hard FK so an event is never lost if the mirror row is pruned).
  woo_order_id    bigint NOT NULL,
  -- The local workflow status the order moved FROM and TO (the POS vocabulary).
  from_status     text NOT NULL,
  to_status       text NOT NULL,
  -- The acting user id (the staffer who tapped the action). NULL only for a
  -- system actor (none today — every transition is operator-initiated).
  actor_user_id   uuid,
  -- Whether this was a forward step, a cancel, or an admin reversal (AC4) — kept
  -- so the timeline reads cleanly without re-deriving from from/to.
  kind            text NOT NULL,
  -- The idempotency key of the wc_outbox writeback enqueued for this event, so the
  -- local event and its Woo side-effect are traceable to each other.
  outbox_idempotency_key text,
  -- Arbitrary event context: the mapped Woo status + note, and on a dispatched
  -- transition the rider/courier name, vehicle, contact and dispatch time (AC5).
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Constrain both status columns to the POS workflow vocabulary (mirrors the
-- wc_orders.local_status CHECK from migration 0093). A CHECK (not a Postgres enum)
-- keeps the migration additive + reversible.
ALTER TABLE order_events
  DROP CONSTRAINT IF EXISTS order_events_from_status_check;
ALTER TABLE order_events
  ADD CONSTRAINT order_events_from_status_check
  CHECK (from_status IN ('new', 'packing', 'ready', 'dispatched', 'fulfilled', 'cancelled'));
ALTER TABLE order_events
  DROP CONSTRAINT IF EXISTS order_events_to_status_check;
ALTER TABLE order_events
  ADD CONSTRAINT order_events_to_status_check
  CHECK (to_status IN ('new', 'packing', 'ready', 'dispatched', 'fulfilled', 'cancelled'));

-- The order timeline reads all events for one order, newest-first.
CREATE INDEX IF NOT EXISTS order_events_woo_order_id_idx
  ON order_events (woo_order_id, created_at DESC);
