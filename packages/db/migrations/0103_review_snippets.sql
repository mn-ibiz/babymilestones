-- P6-E04-S04 (Story 34.4): Public review snippets. The PUBLIC, CURATED face of the
-- Feedback Engine (Epic 34): an admin hand-picks which 5-star comments to publish
-- as testimonials on the marketing home page, each shown under an ANONYMISED
-- attribution label (e.g. "Parent of two, Nairobi") — NEVER a real parent name.
--
-- A `review_snippets` row is a curated projection of ONE `feedback` row (the
-- 5-star comment): it copies the quote (the comment text, possibly trimmed) and an
-- `attribution_label` (defaulted from the parent's active-children count + their
-- residential area, but always editable by the admin to guarantee privacy +
-- accuracy). Curation is reserved to 5-star feedback (enforced in the curate
-- logic). Publication is a deliberate, audited admin act (`published_at` set);
-- unpublishing clears it. `display_order` (nullable) lets the admin order the
-- published quotes on the home page. The public endpoint reads ONLY published rows
-- and exposes ONLY the quote + attribution_label — never the parent id/name or the
-- feedback id.

CREATE TABLE IF NOT EXISTS review_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The 5-star feedback this snippet curates. ON DELETE CASCADE: if the underlying
  -- feedback is ever removed, the curated snippet goes with it.
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  -- The published quote — the feedback comment, possibly trimmed by the curator.
  -- Capped to the feedback comment length (200 chars, AC2 of 34.1).
  quote text NOT NULL CHECK (char_length(quote) <= 200),
  -- The ANONYMISED attribution shown to the public (e.g. "Parent of two, Nairobi").
  -- NEVER a real name. Defaulted from real data, editable to guarantee privacy.
  attribution_label text NOT NULL CHECK (char_length(attribution_label) <= 120),
  -- When the snippet was PUBLISHED to the public home page (AC2). NULL = curated
  -- but not yet public. Set on publish, cleared on unpublish — both audited (AC3).
  published_at timestamptz,
  -- Optional ordering hint for the published quotes on the home page (lower first).
  display_order integer,
  -- The admin who curated the snippet (FK to users).
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- At most ONE snippet per feedback row — a comment is curated once.
  CONSTRAINT review_snippets_feedback_uniq UNIQUE (feedback_id)
);

-- The public endpoint scans published rows ordered by display_order then recency.
CREATE INDEX IF NOT EXISTS review_snippets_published_idx
  ON review_snippets (published_at) WHERE published_at IS NOT NULL;
