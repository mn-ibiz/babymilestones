-- P4-E04-S05 (Story 29.5): Stock push — POS catalogue stock changes propagate to
-- WooCommerce. Additive-only.
--
-- Two changes:
--   1. products.woo_product_id (nullable) — the per-SKU mapping to a Woo product.
--      A NULL mapping means the product is "in-store only" and a stock push is a
--      NO-OP (AC2). NOT enforced unique here: a mis-import could transiently point
--      two SKUs at one Woo id; the reconciliation report (AC6) surfaces drift
--      rather than the DB hard-failing an admin's bulk import mid-transaction.
--   2. wc_stock_reconciliations — the nightly drift report snapshot (AC6). One row
--      per nightly run; `drift` is the JSON list of SKUs whose local + Woo stock
--      disagree. The admin surface reads the newest row. Reading Woo here is for
--      COMPARISON only — it is never written back into local stock.

-- ---------------------------------------------------------------------------
-- products.woo_product_id — the SKU → Woo mapping (AC2).
-- ---------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS woo_product_id bigint;

-- A partial index so the SKU-mapping list + the reconciliation join over MAPPED
-- products only is cheap; unmapped (NULL) products are skipped from both.
CREATE INDEX IF NOT EXISTS products_woo_product_id_idx
  ON products (woo_product_id)
  WHERE woo_product_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- wc_stock_reconciliations — nightly drift report snapshot (AC6).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wc_stock_reconciliations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- When the nightly run generated this report.
  generated_at    timestamptz NOT NULL DEFAULT now(),
  -- Mapped products compared in this run (unmapped products are skipped).
  compared_count  integer NOT NULL DEFAULT 0,
  -- The drifted SKUs (local vs Woo deltas), worst-first. Empty array = all in sync.
  drift           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- The admin surface reads the newest report; index the gate.
CREATE INDEX IF NOT EXISTS wc_stock_reconciliations_generated_at_idx
  ON wc_stock_reconciliations (generated_at DESC);

-- The SKU-mapping admin surface + the reconciliation report are reserved to
-- `manage config` (admin + super_admin), already granted in migration 0035 —
-- mirrors the WooCommerce sync surface (Story 29.7). No new permission row.
