-- P6-E06-S04 (Story 36.4): Blog / parenting stories — a DB-backed blog of parenting
-- articles for SEO + engagement. Each row is a slugged, tagged, authored markdown
-- post with a draft/published lifecycle (AC1). Admin CRUD is gated on `manage config`
-- (AC2 — the same content-mutation gate as CMS pages / review snippets, so no new
-- permission row is needed). The public list + per-article pages render PUBLISHED
-- rows only (AC3); drafts are never exposed.
--
-- A page has a draft/published lifecycle (AC1): `status` is 'draft' until an admin
-- publishes it, at which point `published_at` is stamped. Unpublishing reverts to a
-- draft state and clears the public surface. The body is stored as raw markdown
-- (`body_md`) and rendered to a SAFE HTML subset at read time (no raw HTML passthrough).
--
-- Additive only. Tags are a Postgres text[] array; cover image is an optional URL.

CREATE TABLE IF NOT EXISTS articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- URL slug — lowercase kebab-case, unique so a slug resolves to exactly one
  -- article. App-layer validates the FORMAT (a-z, 0-9, single hyphens); the column
  -- enforces uniqueness + a length bound.
  slug text NOT NULL UNIQUE CHECK (char_length(slug) >= 1 AND char_length(slug) <= 120),
  -- Article title (the public H1 + list title). Non-empty.
  title text NOT NULL CHECK (char_length(btrim(title)) >= 1),
  -- The article body as raw markdown / MDX text. Non-empty.
  body_md text NOT NULL CHECK (char_length(btrim(body_md)) >= 1),
  -- Optional cover/hero image URL (a link to an image stored elsewhere).
  cover_image_url text,
  -- Free-text tags for filtering/browse.
  tags text[] NOT NULL DEFAULT '{}'::text[],
  -- The author's display name (free text — not necessarily a system user).
  author text NOT NULL CHECK (char_length(btrim(author)) >= 1),
  -- Lifecycle (AC1). 'draft' = not yet (re)published; 'published' = live to the public.
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  -- When the article was last published. NULL = never published (draft-only).
  published_at timestamptz,
  -- The admin who created the article (FK to users).
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The public list reads published rows newest-first; the status filter narrows.
CREATE INDEX IF NOT EXISTS articles_status_published_at_idx
  ON articles (status, published_at DESC);
