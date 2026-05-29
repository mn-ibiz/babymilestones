import { regenerateActiveSlots, SLOT_GENERATION_HORIZON_DAYS } from "@bm/catalog";
import type { Database } from "@bm/db";
import type { Job } from "../registry.js";

export interface SlotGenerationJobDeps {
  db: Database;
  /** Clock injection for tests; defaults to real time. */
  now?: () => Date;
}

/** Daily cadence — the rolling slot horizon advances one day at a time. */
const DAILY_MS = 24 * 60 * 60 * 1000;

/**
 * Nightly slot-generation cron (P2-E01-S01 AC2). Materialises every ACTIVE
 * schedule's concrete `session_slots` over the next {@link SLOT_GENERATION_HORIZON_DAYS}
 * days starting today. Idempotent — re-running never duplicates an existing slot
 * and never rewrites one, so booked/already-generated slots keep their capacity
 * snapshot (AC4); each nightly run only extends the leading edge of the horizon.
 */
export function createSlotGenerationJob(deps: SlotGenerationJobDeps): Job {
  const now = deps.now ?? (() => new Date());
  return {
    name: "slot-generation",
    intervalMs: DAILY_MS,
    run: async () => {
      const fromDate = now().toISOString().slice(0, 10);
      await regenerateActiveSlots(deps.db, { fromDate, days: SLOT_GENERATION_HORIZON_DAYS });
    },
  };
}
