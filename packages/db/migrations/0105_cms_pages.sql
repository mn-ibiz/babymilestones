-- P6-E06-S03 (Story 36.3): CMS-driven unit pages — a lightweight, DB-backed CMS so
-- admins edit the public per-unit marketing pages (/play, /talent, /salon, /events,
-- /coaching, and the shop landing) WITHOUT a deploy. The platform's per-unit public
-- pages OPTIONALLY render a PUBLISHED `cms_pages` row when one exists; otherwise they
-- fall back to the existing static `unit-content` model (no row → no behaviour change).
--
-- A page has a draft/published lifecycle (AC2): `status` is 'draft' until an admin
-- publishes it, at which point `published_at` is stamped. The public render reads
-- ONLY published rows; the admin preview reads the draft. Editing a published page
-- moves it back to a draft state until re-published, so the public never sees an
-- in-progress edit.
--
-- Every save AND every publish appends a `cms_page_revisions` snapshot (AC3) so prior
-- versions are retained and viewable — an immutable, append-only history per page.
--
-- Additive only. Content is stored as plain text + a JSONB `body_sections` array
-- (an ordered list of { heading, body } sections). `manage config` (admin /
-- super_admin) already gates content-curation surfaces (e.g. review snippets), so no
-- new permission row is needed.

CREATE TABLE IF NOT EXISTS cms_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The page key — one row per public slug (the unit key, e.g. 'play'). Unique so a
  -- slug resolves to exactly one editable page. App-layer validates the slug is a
  -- known unit key; the column itself stores any non-empty slug.
  slug text NOT NULL UNIQUE CHECK (char_length(slug) >= 1 AND char_length(slug) <= 60),
  -- Lifecycle (AC2). 'draft' = not yet (re)published; 'published' = live to the public.
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  -- Hero headline / short copy (one to two sentences).
  hero_copy text NOT NULL DEFAULT '',
  -- Hero image URL (a link to an image stored elsewhere — no upload infra here).
  hero_image_url text NOT NULL DEFAULT '',
  -- Call-to-action label + href (e.g. "Book now" → "/signup").
  cta_label text NOT NULL DEFAULT '',
  cta_href text NOT NULL DEFAULT '',
  -- Ordered list of body sections, each { heading, body } — stored as a JSONB array.
  body_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The admin who last saved the page (FK to users).
  updated_by uuid REFERENCES users(id),
  -- When the page was last published. NULL = never published (draft-only).
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The public render looks a page up by slug among published rows.
CREATE INDEX IF NOT EXISTS cms_pages_status_idx ON cms_pages (status);

CREATE TABLE IF NOT EXISTS cms_page_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The page this revision belongs to.
  page_id uuid NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  -- An immutable snapshot of the page CONTENT at save/publish time (AC3): the slug,
  -- status, hero copy/image, CTA, and body_sections — everything needed to view or
  -- restore a prior version. Stored as a JSONB blob.
  snapshot jsonb NOT NULL,
  -- The admin who created this revision (the saver/publisher). FK to users.
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The revisions list is read newest-first per page.
CREATE INDEX IF NOT EXISTS cms_page_revisions_page_idx
  ON cms_page_revisions (page_id, created_at DESC);
