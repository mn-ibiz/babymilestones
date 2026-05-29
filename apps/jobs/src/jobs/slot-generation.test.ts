import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { sessionSlots } from "@bm/db";
import {
  createSchedule,
  createService,
  dayOfWeekIso,
  enumerateSlotDates,
  SLOT_GENERATION_HORIZON_DAYS,
} from "@bm/catalog";
import { createSlotGenerationJob } from "./slot-generation.js";

/**
 * P2-E01-S01 AC2 — nightly slot-generation cron. DB-backed via PGlite with an
 * injected clock. Asserts active schedules materialise over the 60-day horizon,
 * inactive schedules are skipped, and re-running is idempotent.
 */
describe("slot-generation cron (P2-E01-S01 AC2)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  const FROM = "2026-06-15";
  const now = () => new Date(`${FROM}T02:00:00.000Z`);

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("runs daily and materialises active schedules over the 60-day horizon", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const dow = dayOfWeekIso(FROM);
    await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dow,
      startTime: "09:00",
      endTime: "10:00",
      slotDurationMinutes: 60,
      capacity: 5,
    });
    // An inactive schedule must generate nothing.
    await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dow,
      startTime: "14:00",
      endTime: "15:00",
      slotDurationMinutes: 60,
      capacity: 5,
      isActive: false,
    });

    const job = createSlotGenerationJob({ db: dbh.db, now });
    expect(job.name).toBe("slot-generation");
    expect(job.intervalMs).toBe(24 * 60 * 60 * 1000);

    await job.run();

    const slots = await dbh.db.select().from(sessionSlots).where(eq(sessionSlots.serviceId, svc.id));
    const expected = enumerateSlotDates(FROM, SLOT_GENERATION_HORIZON_DAYS, dow).length;
    expect(slots).toHaveLength(expected); // only the active schedule, one window/day
    expect(slots.every((s) => s.capacity === 5)).toBe(true);
  });

  it("is idempotent across consecutive nightly runs", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "11:00",
      slotDurationMinutes: 60,
      capacity: 5,
    });
    const job = createSlotGenerationJob({ db: dbh.db, now });
    await job.run();
    const after1 = await dbh.db.select().from(sessionSlots);
    await job.run();
    const after2 = await dbh.db.select().from(sessionSlots);
    expect(after2.length).toBe(after1.length);
  });
});
