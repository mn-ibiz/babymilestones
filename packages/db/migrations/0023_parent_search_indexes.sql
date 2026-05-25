-- P1-E05-S01: parent search by phone or name in ≤300ms. Additive-only.
--
-- Reception searches parents by phone (any format → normalised +2547XXXXXXXX,
-- exact or prefix on users.phone) or by partial name (case-insensitive substring
-- on parents.first_name / last_name). These indexes keep the search fast against
-- a 10k-parent fixture.
--
-- Phone: users.phone is already stored normalised (+2547XXXXXXXX). A btree index
-- backs exact + prefix (LIKE 'prefix%') matches. text_pattern_ops makes the
-- prefix LIKE index-usable regardless of the database collation.
CREATE INDEX IF NOT EXISTS users_phone_pattern_idx
  ON users (phone text_pattern_ops);

-- Name: in production a GIN trigram index (pg_trgm) backs the case-insensitive
-- substring (ILIKE '%term%') match — that is the index the prod query plan uses.
-- PGlite (the test harness) does not ship the pg_trgm extension, so guard the
-- CREATE EXTENSION + GIN index in a DO block that swallows the failure and falls
-- back to plain btree lower(name) indexes. The query uses ILIKE either way, so
-- correctness is identical; only the plan differs (trigram-accelerated in prod).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXECUTE 'CREATE INDEX IF NOT EXISTS parents_first_name_trgm_idx ON parents USING gin (first_name gin_trgm_ops)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS parents_last_name_trgm_idx ON parents USING gin (last_name gin_trgm_ops)';
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback (e.g. PGlite has no pg_trgm): btree lower(name) indexes so the
    -- ILIKE search still has supporting indexes for exact/prefix-cased lookups.
    -- DEFERRED (prod): the GIN trigram indexes above are the real substring
    -- accelerators; this branch only runs where the extension is unavailable.
    EXECUTE 'CREATE INDEX IF NOT EXISTS parents_first_name_lower_idx ON parents (lower(first_name))';
    EXECUTE 'CREATE INDEX IF NOT EXISTS parents_last_name_lower_idx ON parents (lower(last_name))';
END;
$$;
