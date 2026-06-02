-- P4-E04-S07 (Story 29.7): WooCommerce sync scheduler + dead-letter.
-- Additive-only. Four tables back the order pull + writeback drain:
--
--   wc_sync_state    — singleton checkpoint row (last_sync_at + last_pull_at).
--   wc_orders        — local projection of pulled WooCommerce orders (idempotent
--                      upsert on the Woo order id).
--   wc_outbox        — pending writebacks (order-status updates [S02] + stock
--                      pushes [S05]); the worker drains FIFO with bounded
--                      concurrency, retries with exponential backoff and
--                      dead-letters a row that exhausts its attempts.
--   wc_outbox_dead   — dead-lettered writebacks retaining the original request +
--                      the last error + timestamps for admin replay / resolve /
--                      discard.

-- ---------------------------------------------------------------------------
-- wc_sync_state — the pull checkpoint (singleton).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wc_sync_state (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ISO instant of the newest order modification we have pulled; the next pull
  -- asks Woo for `modified_after = last_sync_at`. NULL on a never-run system
  -- (the first pull then fetches everything).
  last_sync_at  timestamptz,
  -- When the most recent pull cycle COMPLETED successfully (drives the >15-min
  -- staleness banner — AC5). NULL until the first successful pull.
  last_pull_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- At most one checkpoint row — a partial unique index over a constant
-- (mirrors woo_config_singleton_idx).
CREATE UNIQUE INDEX IF NOT EXISTS wc_sync_state_singleton_idx
  ON wc_sync_state ((true));

-- ---------------------------------------------------------------------------
-- wc_orders — local projection of pulled WooCommerce orders.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wc_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The WooCommerce order id — UNIQUE so the pull upsert is idempotent (AC1).
  woo_order_id    bigint NOT NULL,
  status          text NOT NULL,
  number          text,
  total           text,
  currency        text,
  -- Woo's own timestamps (strings as Woo reports them); date_modified drives the
  -- checkpoint advance.
  date_created    text,
  date_modified   text,
  -- The full order payload as pulled, for downstream tabs (S01) without a refetch.
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wc_orders_woo_order_id_idx
  ON wc_orders (woo_order_id);

-- ---------------------------------------------------------------------------
-- wc_outbox — pending writebacks drained FIFO with bounded concurrency.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wc_outbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable per-operation key so a retry never double-applies a mutation (AC: idempotency).
  idempotency_key  text NOT NULL,
  -- `order_status` (S02) | `stock_push` (S05).
  kind             text NOT NULL,
  -- The full writeback request (e.g. { woo_order_id, status } or
  -- { woo_product_id, stock_quantity, stock_status }).
  request          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- `pending` (due / backing off) | `done` (applied) — dead-lettered rows move to
  -- wc_outbox_dead and are deleted from here.
  status           text NOT NULL DEFAULT 'pending',
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_error       text,
  done_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- One row per logical operation — idempotency key is UNIQUE (AC: idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS wc_outbox_idempotency_key_idx
  ON wc_outbox (idempotency_key);

-- The drainer scans pending, due rows oldest-first (FIFO) — index the gate.
CREATE INDEX IF NOT EXISTS wc_outbox_drain_idx
  ON wc_outbox (status, next_attempt_at, created_at);

-- ---------------------------------------------------------------------------
-- wc_outbox_dead — dead-lettered writebacks for admin replay / resolve / discard.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wc_outbox_dead (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  text NOT NULL,
  kind             text NOT NULL,
  -- The original request, retained verbatim so a replay re-enqueues it exactly (AC4).
  request          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- `dead` (awaiting action) | `resolved` (manually handled) | `discarded` (AC4).
  status           text NOT NULL DEFAULT 'dead',
  attempts         integer NOT NULL DEFAULT 0,
  last_error       text,
  -- When the row was dead-lettered, and when an admin resolved/discarded it.
  dead_lettered_at timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  discarded_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wc_outbox_dead_status_idx
  ON wc_outbox_dead (status, dead_lettered_at);

-- The admin sync surface (health, dead-letter management, sync-now) is gated by
-- `manage config` (admin + super_admin), already granted in migration 0035; the
-- pull/drain workers are system actors. No new permission row needed.
