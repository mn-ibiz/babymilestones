import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { bookings, children, invoices, parents, sessionSlots, users } from "@bm/db";
import { createService } from "./services.js";
import {
  addDaysIso,
  createSchedule,
  dayOfWeekIso,
  browseServiceSlots,
  deleteFutureUnbookedSlots,
  enumerateSlotDates,
  generateSlotsForSchedule,
  isSlotPast,
  getSchedule,
  getSlotWithRemaining,
  hmToMinutes,
  listSchedules,
  listSlotsWithRemaining,
  minutesToHm,
  regenerateActiveSlots,
  resyncScheduleSlots,
  slotWindows,
  SLOT_GENERATION_HORIZON_DAYS,
  updateSchedule,
} from "./schedules.js";

/**
 * P2-E01-S01 — time-slot model + capacity. Pure window/date math is unit-tested;
 * CRUD, slot materialisation (idempotent, capacity-snapshot), and the
 * remaining-capacity read model are DB-backed via the PGlite harness.
 */
describe("schedule + slot pure helpers (P2-E01-S01)", () => {
  it("parses and formats HH:MM", () => {
    expect(hmToMinutes("00:00")).toBe(0);
    expect(hmToMinutes("09:30")).toBe(570);
    expect(hmToMinutes("23:59")).toBe(1439);
    expect(minutesToHm(0)).toBe("00:00");
    expect(minutesToHm(570)).toBe("09:30");
    expect(() => hmToMinutes("24:00")).toThrow();
    expect(() => hmToMinutes("9:30")).toThrow();
  });

  it("enumerates non-overlapping slot windows (AC2)", () => {
    expect(slotWindows("09:00", "12:00", 60)).toEqual([
      { startTime: "09:00", endTime: "10:00" },
      { startTime: "10:00", endTime: "11:00" },
      { startTime: "11:00", endTime: "12:00" },
    ]);
  });

  it("drops a partial trailing window that overruns endTime (AC2)", () => {
    // 09:00→12:00 in 50-min slots: 09:00, 09:50, 10:40 fit; 11:30+50=12:20 overruns.
    expect(slotWindows("09:00", "12:00", 50)).toEqual([
      { startTime: "09:00", endTime: "09:50" },
      { startTime: "09:50", endTime: "10:40" },
      { startTime: "10:40", endTime: "11:30" },
    ]);
  });

  it("yields no windows when no whole slot fits", () => {
    expect(slotWindows("09:00", "09:30", 60)).toEqual([]);
    expect(slotWindows("09:00", "12:00", 0)).toEqual([]);
  });

  it("adds days across month boundaries (UTC)", () => {
    expect(addDaysIso("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDaysIso("2026-01-01", 31)).toBe("2026-02-01");
  });

  it("enumerates only matching-weekday dates within the window", () => {
    const dow = dayOfWeekIso("2026-06-15");
    // Window is half-open [from, from+days): with days=14, indices 0..13 →
    // 2026-06-15 (i=0) and 2026-06-22 (i=7); 2026-06-29 (i=14) is excluded.
    expect(enumerateSlotDates("2026-06-15", 14, dow)).toEqual(["2026-06-15", "2026-06-22"]);
    // Widening to 15 days pulls in the third matching weekday.
    expect(enumerateSlotDates("2026-06-15", 15, dow)).toEqual([
      "2026-06-15",
      "2026-06-22",
      "2026-06-29",
    ]);
  });
});

describe("schedule CRUD (P2-E01-S01 AC1/AC4)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedService() {
    return createService(dbh.db, { name: "Soft Play", unit: "play" });
  }

  it("creates a schedule active by default (AC1)", async () => {
    const svc = await seedService();
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "12:00",
      slotDurationMinutes: 60,
      capacity: 8,
    });
    expect(sched.serviceId).toBe(svc.id);
    expect(sched.dayOfWeek).toBe(1);
    expect(sched.capacity).toBe(8);
    expect(sched.isActive).toBe(true);
    expect(await getSchedule(dbh.db, sched.id)).not.toBeNull();
  });

  it("patches capacity and soft-retires via isActive (AC4)", async () => {
    const svc = await seedService();
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: 2,
      startTime: "09:00",
      endTime: "10:00",
      slotDurationMinutes: 30,
      capacity: 5,
    });
    const updated = await updateSchedule(dbh.db, sched.id, { capacity: 12, isActive: false });
    expect(updated!.capacity).toBe(12);
    expect(updated!.isActive).toBe(false);
    expect(await updateSchedule(dbh.db, "00000000-0000-0000-0000-000000000000", { capacity: 1 })).toBeNull();
  });

  it("lists schedules filtered by service and active flag", async () => {
    const a = await seedService();
    const b = await seedService();
    await createSchedule(dbh.db, { serviceId: a.id, dayOfWeek: 1, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 30, capacity: 5 });
    await createSchedule(dbh.db, { serviceId: a.id, dayOfWeek: 2, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 30, capacity: 5, isActive: false });
    await createSchedule(dbh.db, { serviceId: b.id, dayOfWeek: 1, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 30, capacity: 5 });
    expect(await listSchedules(dbh.db, { serviceId: a.id })).toHaveLength(2);
    expect(await listSchedules(dbh.db, { serviceId: a.id, activeOnly: true })).toHaveLength(1);
    expect(await listSchedules(dbh.db)).toHaveLength(3);
  });
});

describe("slot materialisation (P2-E01-S01 AC2/AC4)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("expands a schedule into (date × window) slots over the horizon (AC2)", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const from = "2026-06-15";
    const dow = dayOfWeekIso(from);
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dow,
      startTime: "09:00",
      endTime: "12:00",
      slotDurationMinutes: 60, // 3 windows/day
      capacity: 8,
    });
    // 14-day window covers two matching weekdays → 2 dates × 3 windows = 6 slots.
    const n = await generateSlotsForSchedule(dbh.db, sched, { fromDate: from, days: 14 });
    expect(n).toBe(6);
    const slots = await dbh.db.select().from(sessionSlots).where(eq(sessionSlots.scheduleId, sched.id));
    expect(slots).toHaveLength(6);
    expect(slots.every((s) => s.capacity === 8)).toBe(true);
    expect(new Set(slots.map((s) => s.slotDate))).toEqual(new Set([from, addDaysIso(from, 7)]));
  });

  it("is idempotent — re-running inserts nothing new (AC2)", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const from = "2026-06-15";
    const sched = await createSchedule(dbh.db, { serviceId: svc.id, dayOfWeek: dayOfWeekIso(from), startTime: "09:00", endTime: "11:00", slotDurationMinutes: 60, capacity: 4 });
    const first = await generateSlotsForSchedule(dbh.db, sched, { fromDate: from, days: 14 });
    const second = await generateSlotsForSchedule(dbh.db, sched, { fromDate: from, days: 14 });
    expect(first).toBe(4);
    expect(second).toBe(0);
    const slots = await dbh.db.select().from(sessionSlots).where(eq(sessionSlots.scheduleId, sched.id));
    expect(slots).toHaveLength(4);
  });

  it("generates nothing for an inactive schedule", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const from = "2026-06-15";
    const sched = await createSchedule(dbh.db, { serviceId: svc.id, dayOfWeek: dayOfWeekIso(from), startTime: "09:00", endTime: "11:00", slotDurationMinutes: 60, capacity: 4, isActive: false });
    expect(await generateSlotsForSchedule(dbh.db, sched, { fromDate: from, days: 30 })).toBe(0);
  });

  it("a capacity edit never rewrites existing slots, only future ones (AC4)", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const from = "2026-06-15";
    const dow = dayOfWeekIso(from);
    const sched = await createSchedule(dbh.db, { serviceId: svc.id, dayOfWeek: dow, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 60, capacity: 5 });
    // Generate week 1 only (the first matching date) at capacity 5.
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: from, days: 1 });
    // Admin raises capacity to 10, then the nightly job widens the horizon.
    const updated = (await updateSchedule(dbh.db, sched.id, { capacity: 10 }))!;
    await generateSlotsForSchedule(dbh.db, updated, { fromDate: from, days: 14 });

    const slots = await listSlotsWithRemaining(dbh.db, { serviceId: svc.id });
    const week1 = slots.find((s) => s.slotDate === from)!;
    const week2 = slots.find((s) => s.slotDate === addDaysIso(from, 7))!;
    expect(week1.capacity).toBe(5); // snapshot preserved — not retroactively touched
    expect(week2.capacity).toBe(10); // future slot picks up the new capacity
  });

  it("regenerateActiveSlots materialises every active schedule (AC2)", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const from = "2026-06-15";
    const dow = dayOfWeekIso(from);
    await createSchedule(dbh.db, { serviceId: svc.id, dayOfWeek: dow, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 60, capacity: 5 });
    await createSchedule(dbh.db, { serviceId: svc.id, dayOfWeek: dow, startTime: "14:00", endTime: "15:00", slotDurationMinutes: 60, capacity: 5, isActive: false });
    // Only the active schedule's single window on the one matching date in 7 days.
    const total = await regenerateActiveSlots(dbh.db, { fromDate: from, days: 7 });
    expect(total).toBe(1);
  });

  it("defaults the horizon to 60 days", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const from = "2026-06-15";
    const dow = dayOfWeekIso(from);
    const sched = await createSchedule(dbh.db, { serviceId: svc.id, dayOfWeek: dow, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 60, capacity: 5 });
    const n = await generateSlotsForSchedule(dbh.db, sched, { fromDate: from });
    // 60-day window → matching weekday recurs every 7 days: ceil-ish count.
    expect(n).toBe(enumerateSlotDates(from, SLOT_GENERATION_HORIZON_DAYS, dow).length);
    expect(n).toBeGreaterThanOrEqual(8);
  });
});

describe("remaining-capacity read model (P2-E01-S01 AC3)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  /** Insert a booking that consumes a slot (full FK chain). */
  async function bookSlot(slotId: string, serviceId: string, phone: string) {
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Amina", lastName: "Otieno" })
      .returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Zola", dateOfBirth: "2024-01-15" })
      .returning();
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId: p!.id, amountDue: 1000, serviceId, status: "pending" })
      .returning();
    await dbh.db.insert(bookings).values({
      parentId: p!.id,
      childId: c!.id,
      serviceId,
      staffNameSnapshot: "n/a",
      staffRateSnapshot: 1000,
      invoiceId: inv!.id,
      slotId,
    });
  }

  it("remaining == capacity when a slot has no bookings (AC3)", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const from = "2026-06-15";
    const sched = await createSchedule(dbh.db, { serviceId: svc.id, dayOfWeek: dayOfWeekIso(from), startTime: "09:00", endTime: "10:00", slotDurationMinutes: 60, capacity: 8 });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: from, days: 1 });
    const [slot] = await listSlotsWithRemaining(dbh.db, { serviceId: svc.id });
    expect(slot!.bookedCount).toBe(0);
    expect(slot!.remainingCapacity).toBe(8);
  });

  it("remaining = capacity − bookings_in_slot (AC3)", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const from = "2026-06-15";
    const sched = await createSchedule(dbh.db, { serviceId: svc.id, dayOfWeek: dayOfWeekIso(from), startTime: "09:00", endTime: "10:00", slotDurationMinutes: 60, capacity: 3 });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: from, days: 1 });
    const [slot] = await listSlotsWithRemaining(dbh.db, { serviceId: svc.id });
    await bookSlot(slot!.id, svc.id, "+254712000001");
    await bookSlot(slot!.id, svc.id, "+254712000002");

    const after = await getSlotWithRemaining(dbh.db, slot!.id);
    expect(after!.bookedCount).toBe(2);
    expect(after!.remainingCapacity).toBe(1);

    // A booking on one slot must not affect another slot's remaining.
    const list = await listSlotsWithRemaining(dbh.db, { serviceId: svc.id, fromDate: from, toDate: from });
    expect(list).toHaveLength(1);
    expect(list[0]!.remainingCapacity).toBe(1);
  });

  it("getSlotWithRemaining returns null for an unknown slot", async () => {
    expect(await getSlotWithRemaining(dbh.db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("slot reconciliation on schedule edit / retire (P2-E01-S01 AC4)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  const FROM = "2026-06-15";
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  /** Insert a booking consuming a slot (full FK chain). */
  async function bookSlot(slotId: string, serviceId: string, phone: string) {
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Amina", lastName: "Otieno" })
      .returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Zola", dateOfBirth: "2024-01-15" })
      .returning();
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId: p!.id, amountDue: 1000, serviceId, status: "pending" })
      .returning();
    await dbh.db.insert(bookings).values({
      parentId: p!.id,
      childId: c!.id,
      serviceId,
      staffNameSnapshot: "n/a",
      staffRateSnapshot: 1000,
      invoiceId: inv!.id,
      slotId,
    });
  }

  it("deleteFutureUnbookedSlots removes unbooked future slots but preserves booked ones", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "11:00",
      slotDurationMinutes: 60, // 2 windows/day
      capacity: 5,
    });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: FROM, days: 14 });
    const all = await listSlotsWithRemaining(dbh.db, { serviceId: svc.id });
    expect(all.length).toBeGreaterThan(1);
    await bookSlot(all[0]!.id, svc.id, "+254712000010");

    const deleted = await deleteFutureUnbookedSlots(dbh.db, sched.id, FROM);
    expect(deleted).toBe(all.length - 1);
    const remaining = await listSlotsWithRemaining(dbh.db, { serviceId: svc.id });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(all[0]!.id); // the booked slot survived
  });

  it("resyncScheduleSlots withdraws stale old-window slots after a time edit (AC4)", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:00",
      slotDurationMinutes: 60,
      capacity: 5,
    });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: FROM, days: 14 });

    // Admin moves the window to 14:00–15:00.
    const moved = (await updateSchedule(dbh.db, sched.id, { startTime: "14:00", endTime: "15:00" }))!;
    await resyncScheduleSlots(dbh.db, moved, { fromDate: FROM, days: 14 });

    const slots = await listSlotsWithRemaining(dbh.db, { serviceId: svc.id });
    expect(slots.every((s) => s.startTime === "14:00")).toBe(true); // no stale 09:00 ghosts
    expect(slots.length).toBeGreaterThan(0);
  });

  it("resyncScheduleSlots withdraws all future unbooked slots when retired (AC4)", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:00",
      slotDurationMinutes: 60,
      capacity: 5,
    });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: FROM, days: 14 });
    const retired = (await updateSchedule(dbh.db, sched.id, { isActive: false }))!;
    await resyncScheduleSlots(dbh.db, retired, { fromDate: FROM, days: 14 });
    expect(await listSlotsWithRemaining(dbh.db, { serviceId: svc.id })).toHaveLength(0);
  });

  it("browseServiceSlots tags isPast + available over the 7-day window (AC1/AC3)", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:00",
      slotDurationMinutes: 60,
      capacity: 5,
    });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: FROM, days: 14 });

    // Before 09:00 on the slot's day → available.
    const early = await browseServiceSlots(dbh.db, {
      serviceId: svc.id,
      fromDate: FROM,
      days: 7,
      today: FROM,
      nowMinutes: 5 * 60,
    });
    expect(early).toHaveLength(1); // only FROM's slot falls in the 7-day window
    expect(early[0]!.isPast).toBe(false);
    expect(early[0]!.available).toBe(true);

    // After 10:00 the slot has ended → past + unavailable.
    const late = await browseServiceSlots(dbh.db, {
      serviceId: svc.id,
      fromDate: FROM,
      days: 7,
      today: FROM,
      nowMinutes: 11 * 60,
    });
    expect(late[0]!.isPast).toBe(true);
    expect(late[0]!.available).toBe(false);
  });

  it("isSlotPast handles date + earlier/later-today boundaries (AC3)", () => {
    expect(isSlotPast("2026-06-14", "10:00", "2026-06-15", 0)).toBe(true); // earlier date
    expect(isSlotPast("2026-06-16", "10:00", "2026-06-15", 24 * 60)).toBe(false); // later date
    expect(isSlotPast("2026-06-15", "10:00", "2026-06-15", 10 * 60)).toBe(true); // ended exactly now
    expect(isSlotPast("2026-06-15", "10:00", "2026-06-15", 9 * 60)).toBe(false); // still upcoming today
  });

  it("deleteFutureUnbookedSlots leaves PAST slots untouched", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:00",
      slotDurationMinutes: 60,
      capacity: 5,
    });
    // Materialise a window that includes FROM and FROM+7.
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: FROM, days: 14 });
    // Prune only from FROM+7 onward — the FROM slot must survive as "past".
    const deleted = await deleteFutureUnbookedSlots(dbh.db, sched.id, addDaysIso(FROM, 7));
    expect(deleted).toBe(1);
    const remaining = await listSlotsWithRemaining(dbh.db, { serviceId: svc.id });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.slotDate).toBe(FROM);
  });
});
