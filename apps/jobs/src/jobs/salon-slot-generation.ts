import { regenerateSalonSlots, SALON_SLOT_HORIZON_DAYS } from "@bm/catalog";
import type { Database } from "@bm/db";
import type { Job } from "../registry.js";

export interface SalonSlotGenerationJobDeps {
  db: Database;
  /** Clock injection for tests; defaults to real time. */
  now?: () => Date;
}

/** Daily cadence — the rolling salon-slot horizon advances one day at a time. */
const DAILY_MS = 24 * 60 * 60 * 1000;

/**
 * Nightly salon slot-generation cron (P3-E03-S01 / Story 25.1 AC2). Materialises
 * every ACTIVE stylist availability × every active salon service (with a duration)
 * into concrete `salon_slots` over the next {@link SALON_SLOT_HORIZON_DAYS} days
 * starting today. Mirrors the P2-E01 `slot-generation` cron.
 *
 * Purely additive + idempotent — re-running never duplicates an existing slot and
 * never rewrites or deletes one, so booked / already-generated / past slots are
 * never disturbed (AC3); each nightly run only extends the leading edge of the
 * horizon. Editing availability uses the resync path, not this cron.
 */
export function createSalonSlotGenerationJob(deps: SalonSlotGenerationJobDeps): Job {
  const now = deps.now ?? (() => new Date());
  return {
    name: "salon-slot-generation",
    intervalMs: DAILY_MS,
    run: async () => {
      const fromDate = now().toISOString().slice(0, 10);
      await regenerateSalonSlots(deps.db, { fromDate, days: SALON_SLOT_HORIZON_DAYS });
    },
  };
}
