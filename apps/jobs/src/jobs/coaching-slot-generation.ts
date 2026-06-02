import { regenerateCoachingSlots, COACHING_SLOT_HORIZON_DAYS } from "@bm/catalog";
import type { Database } from "@bm/db";
import type { Job } from "../registry.js";

export interface CoachingSlotGenerationJobDeps {
  db: Database;
  /** Clock injection for tests; defaults to real time. */
  now?: () => Date;
}

/** Daily cadence — the rolling coaching-slot horizon advances one day at a time. */
const DAILY_MS = 24 * 60 * 60 * 1000;

/**
 * Nightly coaching slot-generation cron (P5-E01-S02 / Story 31.2 AC1). Materialises
 * every ACTIVE coach availability × every active coaching offering (with a
 * duration) into concrete `coaching_slots` over the next
 * {@link COACHING_SLOT_HORIZON_DAYS} days starting today. Mirrors the salon
 * slot-generation cron; coaching slots are capacity-1.
 *
 * Purely additive + idempotent — re-running never duplicates an existing slot and
 * never rewrites or deletes one, so booked / already-generated / past slots are
 * never disturbed; each nightly run only extends the leading edge of the horizon.
 */
export function createCoachingSlotGenerationJob(deps: CoachingSlotGenerationJobDeps): Job {
  const now = deps.now ?? (() => new Date());
  return {
    name: "coaching-slot-generation",
    intervalMs: DAILY_MS,
    run: async () => {
      const fromDate = now().toISOString().slice(0, 10);
      await regenerateCoachingSlots(deps.db, { fromDate, days: COACHING_SLOT_HORIZON_DAYS });
    },
  };
}
