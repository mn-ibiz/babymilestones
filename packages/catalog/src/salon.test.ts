import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { attendances, auditOutbox, bookings, children, invoices, parents, users } from "@bm/db";
import { createService, setServicePrice, updateService } from "./services.js";
import { createStaff, setStaffActive } from "./staff.js";
import {
  SALON_SLOT_HORIZON_DAYS,
  availabilityCoversDate,
  bookSalonSlot,
  completeSalonService,
  createAdHocSalonSlot,
  createStaffAvailability,
  deleteFutureUnbookedSalonSlots,
  generateSalonSlotsForAvailability,
  getStaffAvailability,
  listAvailableSalonSlots,
  listSalonBookingsForDate,
  listSalonReportingRowsForDate,
  listStaffAvailability,
  listSalonSlots,
  NoStylistAvailableError,
  reassignSalonBooking,
  regenerateSalonSlots,
  resolveLeastBusyStylist,
  resyncStaffAvailabilitySlots,
  SalonAlreadyCompletedError,
  SalonBookingNotFoundError,
  SalonNotCheckedInError,
  SalonServicePriceMissingError,
  SalonSlotNotFoundError,
  SalonSlotTakenError,
  SalonStylistMismatchError,
  SalonStylistUnavailableError,
  updateStaffAvailability,
} from "./salon.js";
import { addDaysIso, dayOfWeekIso, enumerateSlotDates } from "./schedules.js";

/**
 * P3-E03-S01 (Story 25.1) — stylist availability + salon slot creation. Pure
 * helpers are unit-tested; the repository, slot materialisation, and the
 * future-only / booked-slot-protection invariants are DB-backed via PGlite.
 */

const FROM = "2026-06-15"; // a Monday — dayOfWeekIso === 1.

describe("availabilityCoversDate (effective_date_range, AC1)", () => {
  it("is true only within the inclusive [from, to] range", () => {
    expect(availabilityCoversDate("2026-06-15", "2026-06-30", "2026-06-15")).toBe(true);
    expect(availabilityCoversDate("2026-06-15", "2026-06-30", "2026-06-30")).toBe(true);
    expect(availabilityCoversDate("2026-06-15", "2026-06-30", "2026-06-14")).toBe(false);
    expect(availabilityCoversDate("2026-06-15", "2026-06-30", "2026-07-01")).toBe(false);
  });
  it("treats a null effectiveTo as open/ongoing", () => {
    expect(availabilityCoversDate("2026-06-15", null, "2099-01-01")).toBe(true);
    expect(availabilityCoversDate("2026-06-15", null, "2026-06-14")).toBe(false);
  });
});

describe("staff_availability repository (AC1)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("round-trips a weekly availability row with an effective date range", async () => {
    const stylist = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    const row = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "12:00",
      effectiveFrom: "2026-06-15",
      effectiveTo: "2026-12-31",
    });
    expect(row.id).toBeTruthy();
    expect(row.dayOfWeek).toBe(1);
    expect(row.effectiveFrom).toBe("2026-06-15");
    expect(row.effectiveTo).toBe("2026-12-31");
    expect(row.isActive).toBe(true);

    const fetched = await getStaffAvailability(dbh.db, row.id);
    expect(fetched?.startTime).toBe("09:00");

    const list = await listStaffAvailability(dbh.db, { staffId: stylist.id });
    expect(list).toHaveLength(1);
    const activeOnly = await listStaffAvailability(dbh.db, { activeOnly: true });
    expect(activeOnly).toHaveLength(1);
  });

  it("supports an open-ended range (null effectiveTo) and soft-retire", async () => {
    const stylist = await createStaff(dbh.db, { displayName: "Bea", role: "stylist" });
    const row = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: 3,
      startTime: "13:00",
      endTime: "17:00",
      effectiveFrom: "2026-06-15",
    });
    expect(row.effectiveTo).toBeNull();
    const updated = await updateStaffAvailability(dbh.db, row.id, { isActive: false });
    expect(updated?.isActive).toBe(false);
    const activeOnly = await listStaffAvailability(dbh.db, { activeOnly: true });
    expect(activeOnly).toHaveLength(0);
  });
});

describe("salon slot generation (availability × salon service durations, AC2)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("chops a window into back-to-back slots of the service duration, future dates only", async () => {
    const stylist = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    const svc = await createService(dbh.db, { name: "Kids Cut", unit: "salon" });
    await setSalonDuration(dbh, svc.id, 30);

    const avail = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:30", // 90 minutes → three 30-minute slots
      effectiveFrom: FROM,
      effectiveTo: addDaysIso(FROM, 30),
    });

    const inserted = await generateSalonSlotsForAvailability(dbh.db, avail, {
      fromDate: FROM,
      days: SALON_SLOT_HORIZON_DAYS,
      services: [{ id: svc.id, salonDurationMinutes: 30 }],
    });

    // Dates within the horizon whose weekday matches AND that fall in the range.
    const matchingDates = enumerateSlotDates(
      FROM,
      SALON_SLOT_HORIZON_DAYS,
      dayOfWeekIso(FROM),
    ).filter((d) => d <= addDaysIso(FROM, 30));
    expect(inserted).toBe(matchingDates.length * 3);

    const slots = await listSalonSlots(dbh.db, { staffId: stylist.id });
    expect(slots).toHaveLength(matchingDates.length * 3);
    // Every slot is on or after FROM (future-only) and carries the duration snapshot.
    expect(slots.every((s) => s.slotDate >= FROM)).toBe(true);
    expect(slots.every((s) => s.durationMinutes === 30)).toBe(true);
    // First day's three windows.
    const firstDay = slots
      .filter((s) => s.slotDate === FROM)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    expect(firstDay.map((s) => [s.startTime, s.endTime])).toEqual([
      ["09:00", "09:30"],
      ["09:30", "10:00"],
      ["10:00", "10:30"],
    ]);
  });

  it("generates one slot-set per salon service (availability × services)", async () => {
    const stylist = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    const cut = await createService(dbh.db, { name: "Cut", unit: "salon" });
    const wash = await createService(dbh.db, { name: "Wash", unit: "salon" });
    await setSalonDuration(dbh, cut.id, 60);
    await setSalonDuration(dbh, wash.id, 60);
    const avail = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:00",
      effectiveFrom: FROM,
    });
    await generateSalonSlotsForAvailability(dbh.db, avail, {
      fromDate: FROM,
      days: 7,
      services: [
        { id: cut.id, salonDurationMinutes: 60 },
        { id: wash.id, salonDurationMinutes: 60 },
      ],
    });
    const cutSlots = await listSalonSlots(dbh.db, { serviceId: cut.id });
    const washSlots = await listSalonSlots(dbh.db, { serviceId: wash.id });
    expect(cutSlots.length).toBeGreaterThan(0);
    expect(washSlots.length).toBe(cutSlots.length);
  });

  it("respects the effective date range and day_of_week", async () => {
    const stylist = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    const svc = await createService(dbh.db, { name: "Cut", unit: "salon" });
    await setSalonDuration(dbh, svc.id, 60);
    // Availability ends one week in — slots after effectiveTo must not appear.
    const effTo = addDaysIso(FROM, 7);
    const avail = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:00",
      effectiveFrom: FROM,
      effectiveTo: effTo,
    });
    await generateSalonSlotsForAvailability(dbh.db, avail, {
      fromDate: FROM,
      days: 60,
      services: [{ id: svc.id, salonDurationMinutes: 60 }],
    });
    const slots = await listSalonSlots(dbh.db, { staffId: stylist.id });
    expect(slots.every((s) => s.slotDate <= effTo)).toBe(true);
    expect(slots.every((s) => dayOfWeekIso(s.slotDate) === dayOfWeekIso(FROM))).toBe(true);
  });

  it("is idempotent across consecutive runs", async () => {
    const stylist = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    const svc = await createService(dbh.db, { name: "Cut", unit: "salon" });
    await setSalonDuration(dbh, svc.id, 60);
    const avail = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "11:00",
      effectiveFrom: FROM,
    });
    const opts = { fromDate: FROM, days: 14, services: [{ id: svc.id, salonDurationMinutes: 60 }] };
    const first = await generateSalonSlotsForAvailability(dbh.db, avail, opts);
    const second = await generateSalonSlotsForAvailability(dbh.db, avail, opts);
    expect(second).toBe(0); // nothing new on the re-run
    const slots = await listSalonSlots(dbh.db, { staffId: stylist.id });
    expect(slots).toHaveLength(first);
  });

  it("regenerateSalonSlots materialises every active availability × salon services", async () => {
    const a = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    const b = await createStaff(dbh.db, { displayName: "Bea", role: "stylist" });
    const svc = await createService(dbh.db, { name: "Cut", unit: "salon" });
    await setSalonDuration(dbh, svc.id, 60);
    // A non-salon service must be ignored.
    const play = await createService(dbh.db, { name: "Play", unit: "play" });
    await setSalonDuration(dbh, play.id, 60);
    await createStaffAvailability(dbh.db, {
      staffId: a.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:00",
      effectiveFrom: FROM,
    });
    await createStaffAvailability(dbh.db, {
      staffId: b.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "10:00",
      endTime: "11:00",
      effectiveFrom: FROM,
      isActive: false, // inactive → skipped
    });
    const total = await regenerateSalonSlots(dbh.db, { fromDate: FROM, days: 7 });
    expect(total).toBeGreaterThan(0);
    const aSlots = await listSalonSlots(dbh.db, { staffId: a.id });
    const bSlots = await listSalonSlots(dbh.db, { staffId: b.id });
    expect(aSlots.length).toBeGreaterThan(0);
    expect(bSlots).toHaveLength(0); // inactive availability generated nothing
    // No play-service slots were ever created (salon-only).
    const playSlots = await listSalonSlots(dbh.db, { serviceId: play.id });
    expect(playSlots).toHaveLength(0);
  });
});

describe("future-only edits never disturb history / booked slots (AC3)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("deleteFutureUnbookedSalonSlots withdraws future unbooked slots but keeps booked ones", async () => {
    const stylist = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    const svc = await createService(dbh.db, { name: "Cut", unit: "salon" });
    await setSalonDuration(dbh, svc.id, 60);
    const avail = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "11:00",
      effectiveFrom: FROM,
    });
    await generateSalonSlotsForAvailability(dbh.db, avail, {
      fromDate: FROM,
      days: 14,
      services: [{ id: svc.id, salonDurationMinutes: 60 }],
    });
    const slots = await listSalonSlots(dbh.db, { staffId: stylist.id });
    const booked = slots[0]!;

    // Attach a booking to one future slot — it must survive a regeneration prune.
    const [u] = await dbh.db.insert(users).values({ phone: "+254700000001", pinHash: "x" }).returning();
    const [parent] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Pat", lastName: "Doe" })
      .returning();
    const [child] = await dbh.db
      .insert(children)
      .values({ parentId: parent!.id, firstName: "K", dateOfBirth: "2024-01-01" })
      .returning();
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId: parent!.id, amountDue: 0, serviceId: svc.id, status: "pending" })
      .returning();
    await dbh.db.insert(bookings).values({
      parentId: parent!.id,
      childId: child!.id,
      serviceId: svc.id,
      salonSlotId: booked.id,
      invoiceId: inv!.id,
      staffNameSnapshot: stylist.displayName,
      staffRateSnapshot: 0,
    });

    const deleted = await deleteFutureUnbookedSalonSlots(dbh.db, avail.id, FROM);
    expect(deleted).toBe(slots.length - 1); // all but the booked slot

    const after = await listSalonSlots(dbh.db, { staffId: stylist.id });
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(booked.id);
  });

  it("never deletes or mutates PAST slots when editing availability", async () => {
    const stylist = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    const svc = await createService(dbh.db, { name: "Cut", unit: "salon" });
    await setSalonDuration(dbh, svc.id, 60);
    const avail = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "11:00",
      effectiveFrom: addDaysIso(FROM, -60),
    });
    // Generate a window that includes PAST dates (start the horizon in the past).
    const past = addDaysIso(FROM, -28);
    await generateSalonSlotsForAvailability(dbh.db, avail, {
      fromDate: past,
      days: 56, // spans before and after FROM
      services: [{ id: svc.id, salonDurationMinutes: 60 }],
    });
    const before = await listSalonSlots(dbh.db, { staffId: stylist.id });
    const pastCount = before.filter((s) => s.slotDate < FROM).length;
    expect(pastCount).toBeGreaterThan(0);

    // Editing availability prunes only FUTURE (>= today). Past slots are untouched.
    const deleted = await deleteFutureUnbookedSalonSlots(dbh.db, avail.id, FROM);
    const after = await listSalonSlots(dbh.db, { staffId: stylist.id });
    const pastAfter = after.filter((s) => s.slotDate < FROM);
    expect(pastAfter).toHaveLength(pastCount); // every past slot survived
    expect(deleted).toBe(before.length - pastCount); // only future slots removed
  });

  it("resyncStaffAvailabilitySlots prunes stale future slots then regenerates the current rule", async () => {
    const stylist = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    const svc = await createService(dbh.db, { name: "Cut", unit: "salon" });
    await setSalonDuration(dbh, svc.id, 60);
    const avail = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "12:00", // three 60-min slots/day
      effectiveFrom: FROM,
    });
    await generateSalonSlotsForAvailability(dbh.db, avail, {
      fromDate: FROM,
      days: 7,
      services: [{ id: svc.id, salonDurationMinutes: 60 }],
    });
    const initial = await listSalonSlots(dbh.db, { staffId: stylist.id });
    expect(initial.length).toBeGreaterThan(0);

    // Narrow the window to one slot/day, then resync.
    const updated = await updateStaffAvailability(dbh.db, avail.id, { endTime: "10:00" });
    await resyncStaffAvailabilitySlots(dbh.db, updated!, {
      fromDate: FROM,
      days: 7,
      services: [{ id: svc.id, salonDurationMinutes: 60 }],
    });
    const resynced = await listSalonSlots(dbh.db, { staffId: stylist.id });
    // One slot/day now (09:00–10:00), so fewer rows than the three-slot original.
    expect(resynced.length).toBe(initial.length / 3);
    expect(resynced.every((s) => s.endTime <= "10:00")).toBe(true);
  });
});

// Helper: set a salon service's duration via the catalog update path.
async function setSalonDuration(
  dbh: Awaited<ReturnType<typeof createTestDb>>,
  serviceId: string,
  minutes: number,
): Promise<void> {
  await updateService(dbh.db, serviceId, { salonDurationMinutes: minutes });
}

/* --- Parent salon booking (P3-E03-S02 / Story 25.2) ---------------------- */

describe("parent salon booking (P3-E03-S02 / Story 25.2)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  /** A priced salon service with a fixed duration. */
  async function seedSalonService(name = "Kids Cut", priceCents = 2500) {
    const svc = await createService(dbh.db, { name, unit: "salon" });
    await setSalonDuration(dbh, svc.id, 60);
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: priceCents, effectiveFrom: "2026-01-01" });
    return svc;
  }

  /** A stylist with a Monday window that materialises slots for the service on FROM. */
  async function seedStylistWithSlots(serviceId: string, displayName: string, endTime = "12:00") {
    const stylist = await createStaff(dbh.db, { displayName, role: "stylist" });
    const avail = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime,
      effectiveFrom: FROM,
    });
    await generateSalonSlotsForAvailability(dbh.db, avail, {
      fromDate: FROM,
      days: 1,
      services: [{ id: serviceId, salonDurationMinutes: 60 }],
    });
    return stylist;
  }

  async function seedParentChild() {
    const [u] = await dbh.db.insert(users).values({ phone: `+25470${Math.floor(Math.random() * 1e7)}`, pinHash: "x" }).returning();
    const [parent] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Pat", lastName: "Doe" }).returning();
    const [child] = await dbh.db
      .insert(children)
      .values({ parentId: parent!.id, firstName: "Kid", dateOfBirth: "2022-01-01" })
      .returning();
    return { parentId: parent!.id, childId: child!.id };
  }

  it("lists only the chosen stylist's available slots (AC2)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const bree = await seedStylistWithSlots(svc.id, "Bree");

    const all = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((s) => s.staffId))).toEqual(new Set([asha.id, bree.id]));

    const onlyAsha = await listAvailableSalonSlots(dbh.db, {
      serviceId: svc.id,
      staffId: asha.id,
      fromDate: FROM,
      toDate: FROM,
    });
    expect(onlyAsha.length).toBeGreaterThan(0);
    expect(onlyAsha.every((s) => s.staffId === asha.id)).toBe(true);
  });

  it("excludes a slot once it is booked (AC1)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const { parentId, childId } = await seedParentChild();
    const before = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    const slot = before[0]!;

    await bookSalonSlot(dbh.db, { salonSlotId: slot.id, parentId, childId, staffId: asha.id });

    const after = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    expect(after.map((s) => s.id)).not.toContain(slot.id);
    expect(after).toHaveLength(before.length - 1);
  });

  it("confirm creates a booking + pending invoice + attribution, audits (AC4)", async () => {
    const svc = await seedSalonService("Kids Cut", 2500);
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const { parentId, childId } = await seedParentChild();
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });

    const result = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId, childId, staffId: asha.id });
    expect(result.amountCents).toBe(2500);
    expect(result.staffId).toBe(asha.id);

    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, result.invoiceId));
    expect(inv!.status).toBe("pending");
    expect(inv!.amountDue).toBe(2500);

    const [bk] = await dbh.db.select().from(bookings).where(eq(bookings.id, result.bookingId));
    expect(bk!.salonSlotId).toBe(slot!.id);
    expect(bk!.staffId).toBe(asha.id); // attribution captured
    expect(bk!.staffNameSnapshot).toBe("Asha");
    expect(bk!.staffRateSnapshot).toBe(2500);
    expect(bk!.invoiceId).toBe(result.invoiceId);
  });

  it("rejects a double-book of the same salon slot (AC4 race guard)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const a = await seedParentChild();
    const b = await seedParentChild();
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });

    await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: a.parentId, childId: a.childId, staffId: asha.id });
    await expect(
      bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: b.parentId, childId: b.childId, staffId: asha.id }),
    ).rejects.toBeInstanceOf(SalonSlotTakenError);
  });

  it("rejects a stylist pick that does not match the slot (AC2)", async () => {
    const svc = await seedSalonService();
    await seedStylistWithSlots(svc.id, "Asha");
    const bree = await seedStylistWithSlots(svc.id, "Bree");
    const { parentId, childId } = await seedParentChild();
    const ashaSlot = (await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM })).find(
      (s) => s.staffId !== bree.id,
    )!;

    await expect(
      bookSalonSlot(dbh.db, { salonSlotId: ashaSlot.id, parentId, childId, staffId: bree.id }),
    ).rejects.toBeInstanceOf(SalonStylistMismatchError);
  });

  it("throws when the salon service has no price (AC4)", async () => {
    const svc = await createService(dbh.db, { name: "Unpriced", unit: "salon" });
    await setSalonDuration(dbh, svc.id, 60);
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const { parentId, childId } = await seedParentChild();
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    await expect(
      bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId, childId, staffId: asha.id }),
    ).rejects.toBeInstanceOf(SalonServicePriceMissingError);
  });

  it("throws for an unknown salon slot", async () => {
    const { parentId, childId } = await seedParentChild();
    await expect(
      bookSalonSlot(dbh.db, {
        salonSlotId: "00000000-0000-0000-0000-000000000000",
        parentId,
        childId,
      }),
    ).rejects.toBeInstanceOf(SalonSlotNotFoundError);
  });

  it('picks the least-busy stylist for "Any available" — fewest bookings that day (AC3)', async () => {
    const svc = await seedSalonService();
    // Asha and Bree both have slots; pre-book one of Asha's so Bree is least-busy.
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const bree = await seedStylistWithSlots(svc.id, "Bree");
    const a = await seedParentChild();
    const b = await seedParentChild();
    const ashaSlot = (await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: asha.id, fromDate: FROM, toDate: FROM }))[0]!;
    await bookSalonSlot(dbh.db, { salonSlotId: ashaSlot.id, parentId: a.parentId, childId: a.childId, staffId: asha.id });

    const chosen = await resolveLeastBusyStylist(dbh.db, { serviceId: svc.id, date: FROM });
    expect(chosen).toBe(bree.id); // Bree has 0 bookings, Asha has 1

    // Confirming against the chosen stylist's slot attributes Bree (AC3/AC4).
    const breeSlot = (await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: chosen, fromDate: FROM, toDate: FROM }))[0]!;
    const result = await bookSalonSlot(dbh.db, { salonSlotId: breeSlot.id, parentId: b.parentId, childId: b.childId });
    expect(result.staffId).toBe(bree.id);
  });

  it("least-busy tie-break is the smallest staffId, deterministically (AC3)", async () => {
    const svc = await seedSalonService();
    const one = await seedStylistWithSlots(svc.id, "One");
    const two = await seedStylistWithSlots(svc.id, "Two");
    // Both have 0 bookings → tie → smallest staffId wins.
    const expected = one.id < two.id ? one.id : two.id;
    const chosen = await resolveLeastBusyStylist(dbh.db, { serviceId: svc.id, date: FROM });
    expect(chosen).toBe(expected);
    // Stable across repeated calls.
    expect(await resolveLeastBusyStylist(dbh.db, { serviceId: svc.id, date: FROM })).toBe(expected);
  });

  it("least-busy ignores retired stylists and throws when none are available (AC3)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    await setStaffActive(dbh.db, asha.id, false); // retired — never offered
    await expect(resolveLeastBusyStylist(dbh.db, { serviceId: svc.id, date: FROM })).rejects.toBeInstanceOf(
      NoStylistAvailableError,
    );
  });
});

/* --- Salon counter check-in & service completion (P3-E03-S03 / Story 25.3) - */

describe("salon counter board + completion (P3-E03-S03 / Story 25.3)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedSalonService(name = "Kids Cut", priceCents = 2500) {
    const svc = await createService(dbh.db, { name, unit: "salon" });
    await setSalonDuration(dbh, svc.id, 60);
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: priceCents, effectiveFrom: "2026-01-01" });
    return svc;
  }

  async function seedStylistWithSlots(serviceId: string, displayName: string, startTime = "09:00", endTime = "12:00") {
    const stylist = await createStaff(dbh.db, { displayName, role: "stylist" });
    const avail = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime,
      endTime,
      effectiveFrom: FROM,
    });
    await generateSalonSlotsForAvailability(dbh.db, avail, {
      fromDate: FROM,
      days: 1,
      services: [{ id: serviceId, salonDurationMinutes: 60 }],
    });
    return stylist;
  }

  async function seedParentChild(opts: { photoConsent?: boolean; childName?: string } = {}) {
    const [u] = await dbh.db.insert(users).values({ phone: `+25470${Math.floor(Math.random() * 1e7)}`, pinHash: "x" }).returning();
    const [parent] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Pat", lastName: "Doe" }).returning();
    const [child] = await dbh.db
      .insert(children)
      .values({
        parentId: parent!.id,
        firstName: opts.childName ?? "Kid",
        dateOfBirth: "2022-01-01",
        photoConsent: opts.photoConsent ?? false,
      })
      .returning();
    return { userId: u!.id, parentId: parent!.id, childId: child!.id };
  }

  /** Insert the P2-E03-S02 attendance row (a stand-in for a completed check-in). */
  async function checkInAttendance(bookingId: string, actor: string) {
    await dbh.db.insert(attendances).values({ bookingId, checkedInBy: actor });
  }

  // AC1: today's salon bookings, ordered by stylist name then hour, with the
  // stylist / child / consent / lifecycle the board needs.
  it("lists today's salon bookings by stylist then hour (AC1)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const bree = await seedStylistWithSlots(svc.id, "Bree");
    const fam = await seedParentChild({ childName: "Zola", photoConsent: true });

    // Book Asha's 09:00 slot and one of Bree's slots.
    const ashaSlots = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: asha.id, fromDate: FROM, toDate: FROM });
    const breeSlots = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: bree.id, fromDate: FROM, toDate: FROM });
    await bookSalonSlot(dbh.db, { salonSlotId: ashaSlots[0]!.id, parentId: fam.parentId, childId: fam.childId, staffId: asha.id });
    await bookSalonSlot(dbh.db, { salonSlotId: breeSlots[1]!.id, parentId: fam.parentId, childId: fam.childId, staffId: bree.id });

    const board = await listSalonBookingsForDate(dbh.db, { date: FROM });
    expect(board).toHaveLength(2);
    // Ordered by stylist name (Asha before Bree).
    expect(board[0]!.staffName).toBe("Asha");
    expect(board[1]!.staffName).toBe("Bree");
    expect(board[0]!.slotDate).toBe(FROM);
    expect(board[0]!.childName).toBe("Zola");
    expect(board[0]!.photoConsent).toBe(true);
    expect(board[0]!.serviceName).toBe("Kids Cut");
    expect(board[0]!.checkedInAt).toBeNull();
    expect(board[0]!.completedAt).toBeNull();
  });

  it("excludes cancelled bookings and other dates from the board (AC1)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const fam = await seedParentChild();
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: fam.parentId, childId: fam.childId, staffId: asha.id });
    await dbh.db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, booked.bookingId));

    expect(await listSalonBookingsForDate(dbh.db, { date: FROM })).toHaveLength(0);
    // A different date returns nothing.
    expect(await listSalonBookingsForDate(dbh.db, { date: addDaysIso(FROM, 7) })).toHaveLength(0);
  });

  // AC4: a one-off "book now" slot has no availability rule and is bookable.
  it("createAdHocSalonSlot makes a bookable slot with no availability rule (AC4)", async () => {
    const svc = await seedSalonService();
    const stylist = await createStaff(dbh.db, { displayName: "Walk-in Stylist", role: "stylist" });
    const fam = await seedParentChild();

    const slot = await createAdHocSalonSlot(dbh.db, {
      staffId: stylist.id,
      serviceId: svc.id,
      slotDate: FROM,
      startTime: "13:00",
      endTime: "14:00",
    });
    expect(slot.availabilityId).toBeNull();
    expect(slot.durationMinutes).toBe(60);

    const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot.id, parentId: fam.parentId, childId: fam.childId, staffId: stylist.id });
    expect(booked.salonSlotId).toBe(slot.id);
    expect(booked.amountCents).toBe(2500);
  });

  // AC3: mark complete sets the completion state + audits + fires the hook.
  it("completeSalonService sets completed_at, audits, and fires the feedback hook (AC3)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const fam = await seedParentChild({ photoConsent: false });
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: fam.parentId, childId: fam.childId, staffId: asha.id });
    await checkInAttendance(booked.bookingId, fam.userId);

    const hook = vi.fn();
    const completedAt = new Date("2026-06-15T11:30:00.000Z");
    const result = await completeSalonService(
      dbh.db,
      { bookingId: booked.bookingId, actor: fam.userId, now: completedAt },
      hook,
    );
    expect(result.completedAt).toBe(completedAt.toISOString());
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: booked.bookingId, childId: fam.childId, parentId: fam.parentId }),
    );

    const [att] = await dbh.db.select().from(attendances).where(eq(attendances.bookingId, booked.bookingId));
    expect(att!.completedAt?.toISOString()).toBe(completedAt.toISOString());
    expect(att!.completedBy).toBe(fam.userId);

    const [evt] = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "salon.service.completed"));
    expect(evt).toBeTruthy();
  });

  // AC3: photo is consent-gated — dropped when the child has no consent.
  it("drops the completion photo when the child has no consent (AC3)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const fam = await seedParentChild({ photoConsent: false });
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: fam.parentId, childId: fam.childId, staffId: asha.id });
    await checkInAttendance(booked.bookingId, fam.userId);

    const result = await completeSalonService(dbh.db, {
      bookingId: booked.bookingId,
      actor: fam.userId,
      photoRef: "photo://snap-1",
    });
    expect(result.photoStored).toBe(false);
    expect(result.photoSkippedNoConsent).toBe(true);
    const [att] = await dbh.db.select().from(attendances).where(eq(attendances.bookingId, booked.bookingId));
    expect(att!.photoRef).toBeNull();
  });

  it("stores the completion photo when the child consented (AC3)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const fam = await seedParentChild({ photoConsent: true });
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: fam.parentId, childId: fam.childId, staffId: asha.id });
    await checkInAttendance(booked.bookingId, fam.userId);

    const result = await completeSalonService(dbh.db, {
      bookingId: booked.bookingId,
      actor: fam.userId,
      photoRef: "photo://snap-2",
    });
    expect(result.photoStored).toBe(true);
    expect(result.photoSkippedNoConsent).toBe(false);
    const [att] = await dbh.db.select().from(attendances).where(eq(attendances.bookingId, booked.bookingId));
    expect(att!.photoRef).toBe("photo://snap-2");
  });

  it("rejects completion before check-in and double-completion (AC3 guards)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const fam = await seedParentChild();
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: fam.parentId, childId: fam.childId, staffId: asha.id });

    // Not checked in yet.
    await expect(
      completeSalonService(dbh.db, { bookingId: booked.bookingId, actor: fam.userId }),
    ).rejects.toBeInstanceOf(SalonNotCheckedInError);

    await checkInAttendance(booked.bookingId, fam.userId);
    await completeSalonService(dbh.db, { bookingId: booked.bookingId, actor: fam.userId });
    // Second completion is rejected.
    await expect(
      completeSalonService(dbh.db, { bookingId: booked.bookingId, actor: fam.userId }),
    ).rejects.toBeInstanceOf(SalonAlreadyCompletedError);
  });

  it("throws for an unknown / non-salon booking", async () => {
    await expect(
      completeSalonService(dbh.db, { bookingId: "00000000-0000-0000-0000-000000000000", actor: "x" }),
    ).rejects.toBeInstanceOf(SalonBookingNotFoundError);
  });
});

/* --- Reassign a salon booking between stylists (P3-E03-S04 / Story 25.4) --- */

describe("reassign a salon booking between stylists (P3-E03-S04 / Story 25.4)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedSalonService(name = "Kids Cut", priceCents = 2500) {
    const svc = await createService(dbh.db, { name, unit: "salon" });
    await setSalonDuration(dbh, svc.id, 60);
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: priceCents, effectiveFrom: "2026-01-01" });
    return svc;
  }

  async function seedStylistWithSlots(serviceId: string, displayName: string, startTime = "09:00", endTime = "12:00") {
    const stylist = await createStaff(dbh.db, { displayName, role: "stylist" });
    const avail = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime,
      endTime,
      effectiveFrom: FROM,
    });
    await generateSalonSlotsForAvailability(dbh.db, avail, {
      fromDate: FROM,
      days: 1,
      services: [{ id: serviceId, salonDurationMinutes: 60 }],
    });
    return stylist;
  }

  async function seedParentChild() {
    const [u] = await dbh.db.insert(users).values({ phone: `+25470${Math.floor(Math.random() * 1e7)}`, pinHash: "x" }).returning();
    const [parent] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Pat", lastName: "Doe" }).returning();
    const [child] = await dbh.db
      .insert(children)
      .values({ parentId: parent!.id, firstName: "Kid", dateOfBirth: "2022-01-01" })
      .returning();
    return { userId: u!.id, parentId: parent!.id, childId: child!.id };
  }

  /** Book a child onto `staffId`'s first open slot for the service on FROM. */
  async function bookOnto(serviceId: string, staffId: string) {
    const fam = await seedParentChild();
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId, staffId, fromDate: FROM, toDate: FROM });
    const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: fam.parentId, childId: fam.childId, staffId });
    return { ...fam, bookingId: booked.bookingId, salonSlotId: booked.salonSlotId, invoiceId: booked.invoiceId };
  }

  // AC1 + AC2: move the booking to a new stylist's open slot; the old slot frees,
  // the new one is occupied.
  it("moves a booking to a different stylist and frees the old slot / occupies the new (AC1/AC2)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const bree = await seedStylistWithSlots(svc.id, "Bree");
    const fam = await bookOnto(svc.id, asha.id);

    // Asha's slot is taken; Bree has open slots.
    const ashaOpenBefore = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: asha.id, fromDate: FROM, toDate: FROM });
    const breeOpenBefore = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: bree.id, fromDate: FROM, toDate: FROM });

    const result = await reassignSalonBooking(dbh.db, {
      bookingId: fam.bookingId,
      toStaffId: bree.id,
      actor: fam.userId,
    });
    expect(result.bookingId).toBe(fam.bookingId);
    expect(result.fromStaffId).toBe(asha.id);
    expect(result.toStaffId).toBe(bree.id);
    expect(result.newSalonSlotId).not.toBe(fam.salonSlotId);
    expect(result.commissionMoved).toBe(false); // not settled yet

    // The booking now points at a Bree slot, attributed to Bree.
    const [bk] = await dbh.db.select().from(bookings).where(eq(bookings.id, fam.bookingId));
    expect(bk!.staffId).toBe(bree.id);
    expect(bk!.staffNameSnapshot).toBe("Bree");
    expect(bk!.salonSlotId).toBe(result.newSalonSlotId);

    // The original Asha slot is free again; the chosen Bree slot is now consumed.
    const ashaOpenAfter = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: asha.id, fromDate: FROM, toDate: FROM });
    const breeOpenAfter = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: bree.id, fromDate: FROM, toDate: FROM });
    expect(ashaOpenAfter.map((s) => s.id)).toContain(fam.salonSlotId);
    expect(ashaOpenAfter.length).toBe(ashaOpenBefore.length + 1);
    expect(breeOpenAfter.length).toBe(breeOpenBefore.length - 1);
    expect(breeOpenAfter.map((s) => s.id)).not.toContain(result.newSalonSlotId);
  });

  // AC3: attribution snapshot updated + audit recorded.
  it("records a salon.booking.reassigned audit row with the from/to stylists (AC3)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const bree = await seedStylistWithSlots(svc.id, "Bree");
    const fam = await bookOnto(svc.id, asha.id);

    await reassignSalonBooking(dbh.db, { bookingId: fam.bookingId, toStaffId: bree.id, actor: fam.userId });

    const [evt] = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "salon.booking.reassigned"));
    expect(evt).toBeTruthy();
    const payload = evt!.payload as Record<string, unknown>;
    expect(payload.from_staff_id).toBe(asha.id);
    expect(payload.to_staff_id).toBe(bree.id);
    expect(payload.booking_id).toBe(fam.bookingId);
  });

  // AC2: cannot reassign to a stylist with no open slot for that service/date.
  it("rejects a reassign to a stylist with no available slot (AC2)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    // Bree exists but has NO availability/slots for this service on FROM.
    const bree = await createStaff(dbh.db, { displayName: "Bree", role: "stylist" });
    const fam = await bookOnto(svc.id, asha.id);

    await expect(
      reassignSalonBooking(dbh.db, { bookingId: fam.bookingId, toStaffId: bree.id, actor: fam.userId }),
    ).rejects.toBeInstanceOf(SalonStylistUnavailableError);

    // Booking unchanged (still Asha).
    const [bk] = await dbh.db.select().from(bookings).where(eq(bookings.id, fam.bookingId));
    expect(bk!.staffId).toBe(asha.id);
  });

  // AC2: double-book prevention — if the only target slot is already taken, reject.
  it("rejects a reassign when the new stylist is fully booked for the slot (AC2 double-book guard)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha", "09:00", "12:00");
    // Bree has exactly ONE open slot (a 09:00–10:00 window only).
    const bree = await seedStylistWithSlots(svc.id, "Bree", "09:00", "10:00");
    // Fill Bree's single slot with another child.
    await bookOnto(svc.id, bree.id);
    const fam = await bookOnto(svc.id, asha.id);

    await expect(
      reassignSalonBooking(dbh.db, { bookingId: fam.bookingId, toStaffId: bree.id, actor: fam.userId }),
    ).rejects.toBeInstanceOf(SalonStylistUnavailableError);
  });

  // AC2/idempotency: reassigning to the SAME stylist is a no-op.
  it("is a no-op when the target stylist already owns the booking (idempotent)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const fam = await bookOnto(svc.id, asha.id);

    const result = await reassignSalonBooking(dbh.db, { bookingId: fam.bookingId, toStaffId: asha.id, actor: fam.userId });
    expect(result.unchanged).toBe(true);
    expect(result.newSalonSlotId).toBe(fam.salonSlotId);
    const [bk] = await dbh.db.select().from(bookings).where(eq(bookings.id, fam.bookingId));
    expect(bk!.staffId).toBe(asha.id);
    expect(bk!.salonSlotId).toBe(fam.salonSlotId);
  });

  it("throws for an unknown / non-salon booking", async () => {
    const svc = await seedSalonService();
    const bree = await seedStylistWithSlots(svc.id, "Bree");
    await expect(
      reassignSalonBooking(dbh.db, { bookingId: "00000000-0000-0000-0000-000000000000", toStaffId: bree.id, actor: "x" }),
    ).rejects.toBeInstanceOf(SalonBookingNotFoundError);
  });

  it("rejects reassign to an unknown / inactive stylist (AC2)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const fam = await bookOnto(svc.id, asha.id);
    await expect(
      reassignSalonBooking(dbh.db, { bookingId: fam.bookingId, toStaffId: "00000000-0000-0000-0000-000000000000", actor: fam.userId }),
    ).rejects.toBeInstanceOf(SalonStylistUnavailableError);
  });
});

/* --- Salon-specific reporting read model (P3-E03-S05 / Story 25.5) -------- */

describe("listSalonReportingRowsForDate (Story 25.5)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedSalonService(name = "Kids Cut", priceCents = 2500) {
    const svc = await createService(dbh.db, { name, unit: "salon" });
    await updateService(dbh.db, svc.id, { salonDurationMinutes: 60 });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: priceCents, effectiveFrom: "2026-01-01" });
    return svc;
  }

  async function seedStylistWithSlots(serviceId: string, displayName: string) {
    const stylist = await createStaff(dbh.db, { displayName, role: "stylist" });
    const avail = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "12:00",
      effectiveFrom: FROM,
    });
    await generateSalonSlotsForAvailability(dbh.db, avail, {
      fromDate: FROM,
      days: 1,
      services: [{ id: serviceId, salonDurationMinutes: 60 }],
    });
    return stylist;
  }

  async function seedParentChild() {
    const [u] = await dbh.db.insert(users).values({ phone: `+25470${Math.floor(Math.random() * 1e7)}`, pinHash: "x" }).returning();
    const [parent] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Pat", lastName: "Doe" }).returning();
    const [child] = await dbh.db.insert(children).values({ parentId: parent!.id, firstName: "Kid", dateOfBirth: "2022-01-01" }).returning();
    return { userId: u!.id, parentId: parent!.id, childId: child!.id };
  }

  it("returns each non-cancelled booking with its revenue snapshot + lifecycle (AC1)", async () => {
    const svc = await seedSalonService("Kids Cut", 2500);
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const fam = await seedParentChild();
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: asha.id, fromDate: FROM, toDate: FROM });
    const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: fam.parentId, childId: fam.childId, staffId: asha.id });

    const rows = await listSalonReportingRowsForDate(dbh.db, { date: FROM });
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.bookingId).toBe(booked.bookingId);
    expect(r.staffId).toBe(asha.id);
    expect(r.staffName).toBe("Asha");
    expect(r.revenueCents).toBe(2500); // staffRateSnapshot = invoiced amount
    expect(r.slotDate).toBe(FROM);
    expect(r.checkedInAt).toBeNull();
    expect(r.completedAt).toBeNull();
  });

  it("reflects check-in + completion lifecycle for no-show derivation (AC1)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const fam = await seedParentChild();
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: asha.id, fromDate: FROM, toDate: FROM });
    const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: fam.parentId, childId: fam.childId, staffId: asha.id });
    await dbh.db.insert(attendances).values({ bookingId: booked.bookingId, checkedInBy: fam.userId });

    const rows = await listSalonReportingRowsForDate(dbh.db, { date: FROM });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.checkedInAt).not.toBeNull();
  });

  it("excludes cancelled bookings and other dates (AC1)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const fam = await seedParentChild();
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: asha.id, fromDate: FROM, toDate: FROM });
    const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: fam.parentId, childId: fam.childId, staffId: asha.id });
    await dbh.db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, booked.bookingId));

    expect(await listSalonReportingRowsForDate(dbh.db, { date: FROM })).toHaveLength(0);
    expect(await listSalonReportingRowsForDate(dbh.db, { date: addDaysIso(FROM, 7) })).toHaveLength(0);
  });

  it("returns rows for multiple stylists on the day (AC2)", async () => {
    const svc = await seedSalonService();
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const bree = await seedStylistWithSlots(svc.id, "Bree");
    const fam = await seedParentChild();
    const ashaSlots = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: asha.id, fromDate: FROM, toDate: FROM });
    const breeSlots = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: bree.id, fromDate: FROM, toDate: FROM });
    await bookSalonSlot(dbh.db, { salonSlotId: ashaSlots[0]!.id, parentId: fam.parentId, childId: fam.childId, staffId: asha.id });
    await bookSalonSlot(dbh.db, { salonSlotId: breeSlots[0]!.id, parentId: fam.parentId, childId: fam.childId, staffId: bree.id });

    const rows = await listSalonReportingRowsForDate(dbh.db, { date: FROM });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.staffId))).toEqual(new Set([asha.id, bree.id]));
  });

  it("empty day returns no rows", async () => {
    expect(await listSalonReportingRowsForDate(dbh.db, { date: FROM })).toEqual([]);
  });
});
