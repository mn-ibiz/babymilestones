-- P2-E04-S02: product catalogue read for the in-store POS. Additive-only.
--
-- The minimal POS source of truth (the full catalogue lands in P4-E01): a SKU,
-- an optional barcode, a name, a current price (integer KES cents), an on-hand
-- stock count, and a tax treatment mirroring `services.tax_treatment` so the
-- cart (S03) computes per-line tax the same way for goods and services. Retired
-- products are soft-deleted via `is_active = false` so receipt-line history
-- keeps its FK. A small stub product set is seeded below so the till is usable
-- in P2 before the P4 catalogue exists.
CREATE TABLE IF NOT EXISTS products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku            text NOT NULL,
  barcode        text,
  name           text NOT NULL,
  -- Current unit price in integer cents (KES * 100). Non-negative.
  price_cents    bigint NOT NULL CHECK (price_cents >= 0),
  -- On-hand stock; <= 0 means out of stock (greyed out, sale blocked at Pay).
  stock_qty      integer NOT NULL DEFAULT 0,
  -- Mirrors services.tax_treatment (P1-E07-S04). KRA registration deferred → default exempt.
  tax_treatment  text NOT NULL DEFAULT 'vat_exempt'
                 CHECK (tax_treatment IN ('vat_inclusive', 'vat_exclusive', 'vat_exempt', 'zero_rated')),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- SKU is the keyed lookup + unique. Barcode is unique only when present.
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_uniq ON products (sku);
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_uniq ON products (barcode)
  WHERE barcode IS NOT NULL;
-- NOTE: the name search is a substring `ILIKE '%term%'`, which a btree cannot
-- serve, so no btree index on name is created here — over the small P2 stub set
-- a seq scan is cheap. The P4-E01 full catalogue will add a `pg_trgm` GIN index
-- on `name` for substring search at scale (mirrors the parents-search trigram
-- approach; PGlite has no trigram, so prod-only).

-- Minimal stub seed set (P2) — a handful of baby-care retail goods so the POS
-- is usable before the P4 catalogue. Idempotent on the unique SKU.
INSERT INTO products (sku, barcode, name, price_cents, stock_qty, tax_treatment) VALUES
  ('BM-NAPPY-S',  '6161100000017', 'Baby Nappies (S, 40pk)',  85000, 120, 'vat_exempt'),
  ('BM-WIPES',    '6161100000024', 'Baby Wipes (72ct)',       35000,  80, 'vat_exempt'),
  ('BM-LOTION',   '6161100000031', 'Baby Lotion 200ml',       52000,  45, 'vat_exempt'),
  ('BM-BOTTLE',   '6161100000048', 'Feeding Bottle 250ml',    68000,  30, 'vat_exempt'),
  ('BM-ROMPER',   NULL,            'Cotton Romper (0-3m)',    99000,   0, 'vat_exempt')
ON CONFLICT (sku) DO NOTHING;
