-- P6-E04-S01 (Story 34.1): 0–5 rating after every paid touchpoint. The FOUNDATION
-- of the Feedback Engine (Epic 34): one `feedback` row per completed paid
-- touchpoint (salon checkout, play/talent pickup, doula session end, order
-- fulfilled, coaching session end). Stories 34-2/3/4 build on this table.
--
-- LIFECYCLE: a touchpoint completion CREATES an invitation row (rating NULL,
-- invited_at set). The parent later SUBMITS a 0–5 rating + optional comment via
-- an SMS-stub link (the `token`) or the in-app prompt, which sets rating/comment/
-- submitted_at ONCE. AC3 idempotency is enforced two ways:
--   1. UNIQUE (source_type, source_id) — one invitation per touchpoint; a replayed
--      completion (e.g. a retried hook) hits the constraint and is a no-op.
--   2. submit only ever fills a row whose `submitted_at IS NULL` (the repo guards
--      the WHERE), so a re-submit / replay can never overwrite an answered rating.
--
-- `attributed_staff_id` is the stylist/coach/attendant the touchpoint is credited
-- to (nullable: an order has no staff). `rating` is NULLABLE until submitted and
-- CHECK-constrained to 0..5; `comment` is NULLABLE and capped at 200 chars (AC2).
-- The `token` is a separate public uuid the SMS link carries so the link never
-- exposes the internal row id.
--
-- Decision ref Spec Module 7 (AC4): recorded here in the completion notes; no code
-- impact beyond this table + capture.

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Public, link-safe id the SMS-stub one-tap link carries (never the internal id).
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  -- The completion kind: 'salon' | 'attendance' | 'order' | 'coaching' (extensible).
  source_type text NOT NULL,
  -- The id of the source touchpoint (attendance id, order id, ...). Opaque text so
  -- any completion point can key its own row without a per-source FK.
  source_id text NOT NULL,
  -- The parent who receives + owns the invitation (FK to users, matching the rest
  -- of the parent-scoped tables which key on the user id).
  parent_id uuid NOT NULL REFERENCES users(id),
  -- The staff member the touchpoint is attributed to (nullable: an order has none).
  attributed_staff_id uuid,
  -- 0..5 stars. NULL until the parent submits (an open invitation).
  rating integer CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  -- Optional free-text comment, capped at 200 chars (AC2). NULL until/unless given.
  comment text CHECK (comment IS NULL OR char_length(comment) <= 200),
  -- When the invitation was created (the touchpoint completion time).
  invited_at timestamptz NOT NULL DEFAULT now(),
  -- When the parent submitted the rating. NULL = still pending (an open invitation).
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- AC3: at most ONE invitation per source touchpoint. A replayed completion hits
  -- this and is swallowed (ON CONFLICT DO NOTHING in the repo).
  CONSTRAINT feedback_source_uniq UNIQUE (source_type, source_id)
);

-- The SMS link resolves an invitation by its public token (one-tap submit).
CREATE UNIQUE INDEX IF NOT EXISTS feedback_token_uniq ON feedback (token);

-- The parent's pending-feedback list (in-app prompt) scans by parent, open rows.
CREATE INDEX IF NOT EXISTS feedback_parent_pending_idx
  ON feedback (parent_id) WHERE submitted_at IS NULL;
