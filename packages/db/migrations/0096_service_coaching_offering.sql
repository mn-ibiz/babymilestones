-- P5-E01-S01 (Story 31.1): Coaching catalogue (1:1 + group). Additive-only.
--
-- Coaching offerings ARE services (unit = 'coaching', already CHECK-allowed since
-- migration 0028) attributed to a `staff` coach via attribution_role_required =
-- 'coach' (the P1-E07-S02 mechanism — no login). This story extends the shared
-- `services` row with three optional, coaching-oriented attributes so admin can
-- describe an offering without code changes:
--
--   1. `format` — 'one_to_one' | 'group'. Nullable: only coaching offerings carry
--      one; CHECK-constrained to the two literals (NULL passes the CHECK).
--   2. `coaching_duration_minutes` — the session length in MINUTES. Nullable,
--      positive when set (mirrors `salon_duration_minutes` from 0088). Kept
--      separate from `salon_duration_minutes` so the two unit-specific durations
--      never collide.
--   3. `age_stage_tags` — a FREE-SET of pregnancy→early-parenting stage tags
--      ("expecting", "0-3mo", "3-6mo", ...). text[] (nullable); NULL = no tags.
--      A free set (not an enum) so admin can coin new stages without a migration.

-- 1) Coaching session format. Additive, nullable, CHECK-constrained.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS format text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_format_check'
  ) THEN
    ALTER TABLE services
      ADD CONSTRAINT services_format_check
      CHECK (format IS NULL OR format IN ('one_to_one', 'group'));
  END IF;
END
$$;

-- 2) Coaching session duration (minutes). Additive, nullable, positive when set.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS coaching_duration_minutes integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_coaching_duration_minutes_check'
  ) THEN
    ALTER TABLE services
      ADD CONSTRAINT services_coaching_duration_minutes_check
      CHECK (coaching_duration_minutes IS NULL OR coaching_duration_minutes > 0);
  END IF;
END
$$;

-- 3) Optional age-stage tags (free set). text[], nullable. NULL = no tags.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS age_stage_tags text[];
