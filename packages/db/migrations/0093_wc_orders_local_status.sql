-- P4-E04-S01 (Story 29.1): the POS "Online orders" workflow column on wc_orders.
-- Additive-only. The pull job (S07) owns every Woo-sourced column; the POS owns
-- this NEW `local_status` column, which drives the in-store fulfilment workflow
-- (New → Packing → Ready → Dispatched → Fulfilled, plus Cancelled). It is set to
-- 'new' once on INSERT and NEVER overwritten by a re-pull, so the workflow state
-- survives every subsequent sync of the same order.
--
-- All display fields the POS card needs (customer name, phone, shipping method,
-- payment status/method, line items, total) are extracted from `payload` at read
-- time — the table is NOT widened for those.

ALTER TABLE wc_orders
  ADD COLUMN IF NOT EXISTS local_status text NOT NULL DEFAULT 'new';

-- Constrain to the POS workflow vocabulary (mapped to Woo statuses on writeback,
-- S02). A CHECK (not a Postgres enum) keeps the migration additive + reversible
-- and matches the text-status convention used elsewhere in this schema.
ALTER TABLE wc_orders
  DROP CONSTRAINT IF EXISTS wc_orders_local_status_check;
ALTER TABLE wc_orders
  ADD CONSTRAINT wc_orders_local_status_check
  CHECK (local_status IN ('new', 'packing', 'ready', 'dispatched', 'fulfilled', 'cancelled'));

-- The Online-orders queue filters by local_status (the chips) and surfaces New
-- first — index the workflow column so the per-chip read stays a cheap scan.
CREATE INDEX IF NOT EXISTS wc_orders_local_status_idx
  ON wc_orders (local_status);
