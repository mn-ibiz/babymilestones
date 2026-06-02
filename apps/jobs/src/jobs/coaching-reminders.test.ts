import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditOutbox, children, parents, smsOutbox, users } from "@bm/db";
import { createTestDb } from "@bm/db/testing";
import {
  bookCoachingSlot,
  createService,
  createStaff,
  createStaffAvailability,
  dayOfWeekIso,
  generateCoachingSlotsForAvailability,
  listAvailableCoachingSlots,
  setServicePrice,
} from "@bm/catalog";
import { createCoachingRemindersJob } from "./coaching-reminders.js";

/**
 * P5-E01-S02 (Story 31.2) AC5 — day-before 1:1 coaching reminder cron. DB-backed
 * via PGlite with an injected clock. Queues a `coaching.reminder` stub-SMS for
 * every non-cancelled coaching booking whose slot is TOMORROW; idempotent per
 * booking; skips bookings on other dates.
 */
describe("coaching day-before reminder cron (P5-E01-S02 AC5)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  // "Today" is 2026-06-14 → tomorrow is 2026-06-15 (a Monday, dow 1).
  const TODAY = "2026-06-14";
  const TOMORROW = "2026-06-15";
  const now = () => new Date(`${TODAY}T09:00:00.000Z`);

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedOfferingCoach(durationMinutes = 60) {
    const coach = await createStaff(dbh.db, { displayName: "Coach Amina", role: "coach" });
    const svc = await createService(dbh.db, {
      name: "Sleep coaching",
      unit: "coaching",
      attributionRoleRequired: "coach",
      format: "one_to_one",
      coachingDurationMinutes: durationMinutes,
    });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 5000, effectiveFrom: "2020-01-01" });
    const avail = await createStaffAvailability(dbh.db, {
      staffId: coach.id,
      dayOfWeek: dayOfWeekIso(TOMORROW),
      startTime: "09:00",
      endTime: "10:00",
      effectiveFrom: TOMORROW,
    });
    await generateCoachingSlotsForAvailability(dbh.db, avail, {
      fromDate: TOMORROW,
      days: 1,
      services: [{ id: svc.id, coachingDurationMinutes: durationMinutes }],
    });
    return { coach, svc };
  }

  async function seedParentChild(phone: string) {
    const [u] = await dbh.db.insert(users).values({ role: "parent", phone }).returning();
    const [parent] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Ada", lastName: "Doe" }).returning();
    const [child] = await dbh.db
      .insert(children)
      .values({ parentId: parent!.id, firstName: "Ada", dateOfBirth: "2022-01-01" })
      .returning();
    return { parentId: parent!.id, childId: child!.id, userId: u!.id };
  }

  it("is a daily cron job", () => {
    const job = createCoachingRemindersJob({ db: dbh.db });
    expect(job.name).toBe("coaching-reminders");
    expect(job.intervalMs).toBe(24 * 60 * 60 * 1000);
  });

  it("queues a reminder for a coaching booking that is tomorrow (AC5)", async () => {
    const { coach, svc } = await seedOfferingCoach();
    const fam = await seedParentChild("+254712000001");
    const [slot] = await listAvailableCoachingSlots(dbh.db, { serviceId: svc.id, fromDate: TOMORROW, toDate: TOMORROW });
    await bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId: fam.parentId, childId: fam.childId, staffId: coach.id });

    await createCoachingRemindersJob({ db: dbh.db, now }).run();

    const rows = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, "coaching.reminder"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.phone).toBe("+254712000001");
    expect(rows[0]!.body).toContain("tomorrow");
    expect(rows[0]!.body).toContain("Sleep coaching");
  });

  it("is idempotent — a second run the same day does not double-send (AC5)", async () => {
    const { coach, svc } = await seedOfferingCoach();
    const fam = await seedParentChild("+254712000002");
    const [slot] = await listAvailableCoachingSlots(dbh.db, { serviceId: svc.id, fromDate: TOMORROW, toDate: TOMORROW });
    await bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId: fam.parentId, childId: fam.childId, staffId: coach.id });

    await createCoachingRemindersJob({ db: dbh.db, now }).run();
    await createCoachingRemindersJob({ db: dbh.db, now }).run();

    const rows = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, "coaching.reminder"));
    expect(rows).toHaveLength(1);
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "coaching.reminder.sent"));
    expect(audits).toHaveLength(1);
  });

  it("does not remind for bookings that are not tomorrow", async () => {
    // Set "today" to the slot day itself, so the slot is TODAY (not tomorrow).
    const { coach, svc } = await seedOfferingCoach();
    const fam = await seedParentChild("+254712000003");
    const [slot] = await listAvailableCoachingSlots(dbh.db, { serviceId: svc.id, fromDate: TOMORROW, toDate: TOMORROW });
    await bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId: fam.parentId, childId: fam.childId, staffId: coach.id });

    const sameDay = () => new Date(`${TOMORROW}T09:00:00.000Z`);
    await createCoachingRemindersJob({ db: dbh.db, now: sameDay }).run();

    const rows = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, "coaching.reminder"));
    expect(rows).toHaveLength(0);
  });
});
