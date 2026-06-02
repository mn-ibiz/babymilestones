import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { coachingSlots } from "@bm/db";
import { createTestDb } from "@bm/db/testing";
import {
  COACHING_SLOT_HORIZON_DAYS,
  createService,
  createStaff,
  createStaffAvailability,
  dayOfWeekIso,
  enumerateSlotDates,
} from "@bm/catalog";
import { createCoachingSlotGenerationJob } from "./coaching-slot-generation.js";

/**
 * P5-E01-S02 (Story 31.2) AC1 — nightly coaching slot-generation cron. DB-backed
 * via PGlite with an injected clock. Mirrors the salon cron: active coach
 * availabilities × coaching offerings materialise over the horizon, inactive
 * availabilities are skipped, re-running is idempotent.
 */
describe("coaching-slot-generation cron (P5-E01-S02 AC1)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  const FROM = "2026-06-15";
  const now = () => new Date(`${FROM}T02:00:00.000Z`);

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("runs daily and materialises active coach availabilities over the 60-day horizon", async () => {
    const coach = await createStaff(dbh.db, { displayName: "Coach Amina", role: "coach" });
    const svc = await createService(dbh.db, {
      name: "Sleep coaching",
      unit: "coaching",
      attributionRoleRequired: "coach",
      coachingDurationMinutes: 60,
    });
    const dow = dayOfWeekIso(FROM);
    await createStaffAvailability(dbh.db, {
      staffId: coach.id,
      dayOfWeek: dow,
      startTime: "09:00",
      endTime: "10:00",
      effectiveFrom: FROM,
    });
    // An inactive availability must generate nothing.
    await createStaffAvailability(dbh.db, {
      staffId: coach.id,
      dayOfWeek: dow,
      startTime: "14:00",
      endTime: "15:00",
      effectiveFrom: FROM,
      isActive: false,
    });

    const job = createCoachingSlotGenerationJob({ db: dbh.db, now });
    expect(job.name).toBe("coaching-slot-generation");
    expect(job.intervalMs).toBe(24 * 60 * 60 * 1000);

    await job.run();

    const slots = await dbh.db.select().from(coachingSlots).where(eq(coachingSlots.serviceId, svc.id));
    const expected = enumerateSlotDates(FROM, COACHING_SLOT_HORIZON_DAYS, dow).length;
    expect(slots).toHaveLength(expected);
    expect(slots.every((s) => s.durationMinutes === 60)).toBe(true);
    expect(slots.every((s) => s.slotDate >= FROM)).toBe(true);
  });

  it("is idempotent across consecutive nightly runs", async () => {
    const coach = await createStaff(dbh.db, { displayName: "Coach Amina", role: "coach" });
    await createService(dbh.db, {
      name: "Sleep coaching",
      unit: "coaching",
      attributionRoleRequired: "coach",
      coachingDurationMinutes: 30,
    });
    await createStaffAvailability(dbh.db, {
      staffId: coach.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "11:00",
      effectiveFrom: FROM,
    });
    const job = createCoachingSlotGenerationJob({ db: dbh.db, now });
    await job.run();
    const after1 = await dbh.db.select().from(coachingSlots);
    await job.run();
    const after2 = await dbh.db.select().from(coachingSlots);
    expect(after2.length).toBe(after1.length);
  });
});
