import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { salonSlots } from "@bm/db";
import {
  createService,
  createStaff,
  createStaffAvailability,
  dayOfWeekIso,
  enumerateSlotDates,
  updateService,
  SALON_SLOT_HORIZON_DAYS,
} from "@bm/catalog";
import { createSalonSlotGenerationJob } from "./salon-slot-generation.js";

/**
 * P3-E03-S01 (Story 25.1) AC2 — nightly salon slot-generation cron. DB-backed via
 * PGlite with an injected clock. Asserts active availabilities × salon services
 * materialise over the 60-day horizon, inactive availabilities are skipped, and
 * re-running is idempotent (AC3 — never disturbs existing/booked/past slots).
 */
describe("salon-slot-generation cron (P3-E03-S01 AC2)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  const FROM = "2026-06-15";
  const now = () => new Date(`${FROM}T02:00:00.000Z`);

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("runs daily and materialises active availabilities over the 60-day horizon", async () => {
    const stylist = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    const svc = await createService(dbh.db, { name: "Kids Cut", unit: "salon" });
    await updateService(dbh.db, svc.id, { salonDurationMinutes: 60 });
    const dow = dayOfWeekIso(FROM);
    await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dow,
      startTime: "09:00",
      endTime: "10:00",
      effectiveFrom: FROM,
    });
    // An inactive availability must generate nothing.
    await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dow,
      startTime: "14:00",
      endTime: "15:00",
      effectiveFrom: FROM,
      isActive: false,
    });

    const job = createSalonSlotGenerationJob({ db: dbh.db, now });
    expect(job.name).toBe("salon-slot-generation");
    expect(job.intervalMs).toBe(24 * 60 * 60 * 1000);

    await job.run();

    const slots = await dbh.db.select().from(salonSlots).where(eq(salonSlots.serviceId, svc.id));
    const expected = enumerateSlotDates(FROM, SALON_SLOT_HORIZON_DAYS, dow).length;
    expect(slots).toHaveLength(expected); // one 60-min window/day, active availability only
    expect(slots.every((s) => s.durationMinutes === 60)).toBe(true);
    expect(slots.every((s) => s.slotDate >= FROM)).toBe(true); // future-only
  });

  it("is idempotent across consecutive nightly runs", async () => {
    const stylist = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    const svc = await createService(dbh.db, { name: "Kids Cut", unit: "salon" });
    await updateService(dbh.db, svc.id, { salonDurationMinutes: 30 });
    await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "11:00",
      effectiveFrom: FROM,
    });
    const job = createSalonSlotGenerationJob({ db: dbh.db, now });
    await job.run();
    const after1 = await dbh.db.select().from(salonSlots);
    await job.run();
    const after2 = await dbh.db.select().from(salonSlots);
    expect(after2.length).toBe(after1.length);
  });
});
