import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, bookings, children, invoices, parents, users } from "@bm/db";
import { createService, setServicePrice } from "./services.js";
import { createStaff, setStaffActive } from "./staff.js";
import { createStaffAvailability } from "./salon.js";
import {
  COACHING_SLOT_HORIZON_DAYS,
  bookCoachingSlot,
  CoachingServicePriceMissingError,
  CoachingSlotFullError,
  CoachingSlotNotFoundError,
  CoachingSlotTakenError,
  CoachingCoachMismatchError,
  generateCoachingSlotsForAvailability,
  listAvailableCoachingSlots,
  listAvailableCoachingSlotsWithSeats,
  listCoachingOfferingDurations,
  listCoachingSlots,
  regenerateCoachingSlots,
} from "./coaching.js";
import { addDaysIso, dayOfWeekIso, enumerateSlotDates } from "./schedules.js";

/**
 * P5-E01-S02 (Story 31.2) — Coach availability + 1:1 booking. Coach availability
 * REUSES the generic `staff_availability` table (the P3-E03-S01 mechanism, AC1);
 * the bookable `coaching_slots` are capacity-1 (AC3). DB-backed via PGlite.
 */

const FROM = "2026-06-15"; // a Monday — dayOfWeekIso === 1.

describe("coaching slot generation (AC1)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("chops a coach's availability window into back-to-back slots of the offering duration, future dates only", async () => {
    const coach = await createStaff(dbh.db, { displayName: "Coach Amina", role: "coach" });
    const svc = await createService(dbh.db, {
      name: "Sleep coaching",
      unit: "coaching",
      attributionRoleRequired: "coach",
      format: "one_to_one",
      coachingDurationMinutes: 30,
    });
    const avail = await createStaffAvailability(dbh.db, {
      staffId: coach.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:30", // 90 minutes → three 30-minute slots
      effectiveFrom: FROM,
      effectiveTo: addDaysIso(FROM, 30),
    });

    const inserted = await generateCoachingSlotsForAvailability(dbh.db, avail, {
      fromDate: FROM,
      days: COACHING_SLOT_HORIZON_DAYS,
      services: [{ id: svc.id, coachingDurationMinutes: 30 }],
    });

    const matchingDates = enumerateSlotDates(FROM, COACHING_SLOT_HORIZON_DAYS, dayOfWeekIso(FROM)).filter(
      (d) => d <= addDaysIso(FROM, 30),
    );
    expect(inserted).toBe(matchingDates.length * 3);

    const slots = await listCoachingSlots(dbh.db, { staffId: coach.id });
    expect(slots).toHaveLength(matchingDates.length * 3);
    expect(slots.every((s) => s.slotDate >= FROM)).toBe(true);
    expect(slots.every((s) => s.durationMinutes === 30)).toBe(true);
    const firstDay = slots
      .filter((s) => s.slotDate === FROM)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    expect(firstDay.map((s) => [s.startTime, s.endTime])).toEqual([
      ["09:00", "09:30"],
      ["09:30", "10:00"],
      ["10:00", "10:30"],
    ]);
  });

  it("is idempotent across consecutive runs (booked/past slots preserved)", async () => {
    const coach = await createStaff(dbh.db, { displayName: "Coach Bea", role: "coach" });
    const svc = await createService(dbh.db, {
      name: "Feeding",
      unit: "coaching",
      attributionRoleRequired: "coach",
      coachingDurationMinutes: 60,
    });
    const avail = await createStaffAvailability(dbh.db, {
      staffId: coach.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "11:00",
      effectiveFrom: FROM,
    });
    const opts = { fromDate: FROM, days: 14, services: [{ id: svc.id, coachingDurationMinutes: 60 }] };
    const first = await generateCoachingSlotsForAvailability(dbh.db, avail, opts);
    const second = await generateCoachingSlotsForAvailability(dbh.db, avail, opts);
    expect(second).toBe(0);
    const slots = await listCoachingSlots(dbh.db, { staffId: coach.id });
    expect(slots).toHaveLength(first);
  });

  it("regenerateCoachingSlots materialises every active coach availability × coaching offerings; ignores other units", async () => {
    const a = await createStaff(dbh.db, { displayName: "Coach A", role: "coach" });
    const svc = await createService(dbh.db, {
      name: "Coaching",
      unit: "coaching",
      attributionRoleRequired: "coach",
      coachingDurationMinutes: 60,
    });
    // A salon service must be ignored by the coaching generator.
    const salon = await createService(dbh.db, { name: "Cut", unit: "salon", salonDurationMinutes: 60 });
    await createStaffAvailability(dbh.db, {
      staffId: a.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:00",
      effectiveFrom: FROM,
    });
    const total = await regenerateCoachingSlots(dbh.db, { fromDate: FROM, days: 7 });
    expect(total).toBeGreaterThan(0);
    const salonSlots = await listCoachingSlots(dbh.db, { serviceId: salon.id });
    expect(salonSlots).toHaveLength(0);
    const coachingSlotsRows = await listCoachingSlots(dbh.db, { serviceId: svc.id });
    expect(coachingSlotsRows.length).toBe(total);
  });

  it("listCoachingOfferingDurations skips offerings with no duration set", async () => {
    await createService(dbh.db, { name: "No-duration", unit: "coaching", attributionRoleRequired: "coach" });
    const priced = await createService(dbh.db, {
      name: "With-duration",
      unit: "coaching",
      attributionRoleRequired: "coach",
      coachingDurationMinutes: 45,
    });
    const durs = await listCoachingOfferingDurations(dbh.db);
    expect(durs.map((d) => d.id)).toEqual([priced.id]);
    expect(durs[0]!.coachingDurationMinutes).toBe(45);
  });
});

describe("1:1 coaching booking — capacity 1 (AC2/AC3/AC4)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedCoachWithSlots(serviceId: string, name: string, durationMinutes = 60) {
    const coach = await createStaff(dbh.db, { displayName: name, role: "coach" });
    const avail = await createStaffAvailability(dbh.db, {
      staffId: coach.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:00",
      effectiveFrom: FROM,
    });
    await generateCoachingSlotsForAvailability(dbh.db, avail, {
      fromDate: FROM,
      days: 1,
      services: [{ id: serviceId, coachingDurationMinutes: durationMinutes }],
    });
    return coach;
  }

  async function seedParentChild() {
    const [u] = await dbh.db
      .insert(users)
      .values({ role: "parent", phone: `+25470000${Math.floor(Math.random() * 9000) + 1000}` })
      .returning();
    const [parent] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Pat", lastName: "Doe" }).returning();
    const [child] = await dbh.db
      .insert(children)
      .values({ parentId: parent!.id, firstName: "Kid", dateOfBirth: "2022-01-01" })
      .returning();
    return { parentId: parent!.id, childId: child!.id, userId: u!.id };
  }

  async function priceCoaching(name = "Sleep coaching", amountCents = 5000) {
    const svc = await createService(dbh.db, {
      name,
      unit: "coaching",
      attributionRoleRequired: "coach",
      format: "one_to_one",
      coachingDurationMinutes: 60,
    });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents, effectiveFrom: "2020-01-01" });
    return svc;
  }

  it("confirm creates a booking + pending invoice + coach attribution, audits booking.created (AC2/AC3)", async () => {
    const svc = await priceCoaching("Sleep coaching", 5000);
    const coach = await seedCoachWithSlots(svc.id, "Coach Amina");
    const { parentId, childId, userId } = await seedParentChild();
    const [slot] = await listAvailableCoachingSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });

    const result = await bookCoachingSlot(dbh.db, {
      coachingSlotId: slot!.id,
      parentId,
      childId,
      staffId: coach.id,
      actor: userId,
    });
    expect(result.amountCents).toBe(5000);
    expect(result.staffId).toBe(coach.id);

    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, result.invoiceId));
    expect(inv!.status).toBe("pending");
    expect(inv!.amountDue).toBe(5000);

    const [bk] = await dbh.db.select().from(bookings).where(eq(bookings.id, result.bookingId));
    expect(bk!.coachingSlotId).toBe(slot!.id);
    expect(bk!.staffId).toBe(coach.id);
    expect(bk!.staffNameSnapshot).toBe("Coach Amina");
    expect(bk!.staffRateSnapshot).toBe(5000);

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "booking.created"));
    expect(audits.length).toBe(1);
  });

  it("holds the slot privately — a second booker for the same slot is rejected (AC3 capacity=1)", async () => {
    const svc = await priceCoaching();
    const coach = await seedCoachWithSlots(svc.id, "Coach Amina");
    const a = await seedParentChild();
    const b = await seedParentChild();
    const [slot] = await listAvailableCoachingSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });

    await bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId: a.parentId, childId: a.childId, staffId: coach.id });
    await expect(
      bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId: b.parentId, childId: b.childId, staffId: coach.id }),
    ).rejects.toBeInstanceOf(CoachingSlotTakenError);

    // The booked slot is no longer available to anyone else (private hold, AC3).
    const after = await listAvailableCoachingSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    expect(after.map((s) => s.id)).not.toContain(slot!.id);
  });

  it("rejects a coach pick that does not match the slot's coach (AC2)", async () => {
    const svc = await priceCoaching();
    const amina = await seedCoachWithSlots(svc.id, "Coach Amina");
    const bea = await seedCoachWithSlots(svc.id, "Coach Bea");
    const { parentId, childId } = await seedParentChild();
    const aminaSlot = (await listAvailableCoachingSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM })).find(
      (s) => s.staffId === amina.id,
    )!;
    await expect(
      bookCoachingSlot(dbh.db, { coachingSlotId: aminaSlot.id, parentId, childId, staffId: bea.id }),
    ).rejects.toBeInstanceOf(CoachingCoachMismatchError);
  });

  it("throws when the coaching offering has no price (AC4)", async () => {
    const svc = await createService(dbh.db, {
      name: "Unpriced",
      unit: "coaching",
      attributionRoleRequired: "coach",
      coachingDurationMinutes: 60,
    });
    const coach = await seedCoachWithSlots(svc.id, "Coach Amina");
    const { parentId, childId } = await seedParentChild();
    const [slot] = await listAvailableCoachingSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    await expect(
      bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId, childId, staffId: coach.id }),
    ).rejects.toBeInstanceOf(CoachingServicePriceMissingError);
  });

  it("throws for an unknown coaching slot", async () => {
    const { parentId, childId } = await seedParentChild();
    await expect(
      bookCoachingSlot(dbh.db, { coachingSlotId: "00000000-0000-0000-0000-000000000000", parentId, childId }),
    ).rejects.toBeInstanceOf(CoachingSlotNotFoundError);
  });

  it("rejects booking a slot whose coach is retired", async () => {
    const svc = await priceCoaching();
    const coach = await seedCoachWithSlots(svc.id, "Coach Amina");
    const { parentId, childId } = await seedParentChild();
    const [slot] = await listAvailableCoachingSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    await setStaffActive(dbh.db, coach.id, false);
    await expect(
      bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId, childId }),
    ).rejects.toBeInstanceOf(CoachingCoachMismatchError);
  });
});

/**
 * P5-E01-S03 (Story 31.3) — Group session booking. A group coaching offering is a
 * coaching slot with capacity > 1 (AC1); parents book INDIVIDUAL seats and the
 * availability shows SEATS REMAINING (AC2); the payment + reminder flow is the same
 * as 1:1 (AC3 — each seat raises its own pending invoice via the booking path).
 */
describe("group coaching slot generation + seat booking (P5-E01-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedParentChild() {
    const [u] = await dbh.db
      .insert(users)
      .values({ role: "parent", phone: `+25470000${Math.floor(Math.random() * 9000) + 1000}` })
      .returning();
    const [parent] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Pat", lastName: "Doe" }).returning();
    const [child] = await dbh.db
      .insert(children)
      .values({ parentId: parent!.id, firstName: "Kid", dateOfBirth: "2022-01-01" })
      .returning();
    return { parentId: parent!.id, childId: child!.id, userId: u!.id };
  }

  /** A priced group coaching offering with `capacity` seats and a 60-min session. */
  async function priceGroupCoaching(capacity: number, amountCents = 5000) {
    const svc = await createService(dbh.db, {
      name: "New-parent group",
      unit: "coaching",
      attributionRoleRequired: "coach",
      format: "group",
      coachingDurationMinutes: 60,
      coachingCapacity: capacity,
    });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents, effectiveFrom: "2020-01-01" });
    return svc;
  }

  async function seedGroupCoachWithSlots(serviceId: string, name: string, capacity: number) {
    const coach = await createStaff(dbh.db, { displayName: name, role: "coach" });
    const avail = await createStaffAvailability(dbh.db, {
      staffId: coach.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:00",
      effectiveFrom: FROM,
    });
    await generateCoachingSlotsForAvailability(dbh.db, avail, {
      fromDate: FROM,
      days: 1,
      services: [{ id: serviceId, coachingDurationMinutes: 60, capacity }],
    });
    return coach;
  }

  it("generates group slots with capacity = N; a 1:1 offering stays capacity 1 (AC1)", async () => {
    const group = await priceGroupCoaching(8);
    const groupCoach = await seedGroupCoachWithSlots(group.id, "Coach Group", 8);
    const groupSlots = await listCoachingSlots(dbh.db, { staffId: groupCoach.id });
    expect(groupSlots.length).toBeGreaterThan(0);
    expect(groupSlots.every((s) => s.capacity === 8)).toBe(true);

    // A 1:1 offering generated with capacity 1 (the default snapshot).
    const oneToOne = await createService(dbh.db, {
      name: "Sleep 1:1",
      unit: "coaching",
      attributionRoleRequired: "coach",
      format: "one_to_one",
      coachingDurationMinutes: 60,
    });
    const soloCoach = await createStaff(dbh.db, { displayName: "Coach Solo", role: "coach" });
    const soloAvail = await createStaffAvailability(dbh.db, {
      staffId: soloCoach.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:00",
      effectiveFrom: FROM,
    });
    await generateCoachingSlotsForAvailability(dbh.db, soloAvail, {
      fromDate: FROM,
      days: 1,
      services: [{ id: oneToOne.id, coachingDurationMinutes: 60 }], // no capacity → 1
    });
    const soloSlots = await listCoachingSlots(dbh.db, { staffId: soloCoach.id });
    expect(soloSlots.every((s) => s.capacity === 1)).toBe(true);
  });

  it("availability exposes seatsRemaining = capacity − booked; decrements per seat (AC2)", async () => {
    const svc = await priceGroupCoaching(3);
    const coach = await seedGroupCoachWithSlots(svc.id, "Coach Group", 3);
    const [slot] = await listAvailableCoachingSlotsWithSeats(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    expect(slot!.capacity).toBe(3);
    expect(slot!.seatsRemaining).toBe(3);

    const a = await seedParentChild();
    await bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId: a.parentId, childId: a.childId, staffId: coach.id });
    const [afterOne] = await listAvailableCoachingSlotsWithSeats(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    expect(afterOne!.seatsRemaining).toBe(2);
  });

  it("books up to N seats; the (N+1)th is rejected as full; full slots drop from availability (AC2)", async () => {
    const svc = await priceGroupCoaching(2);
    const coach = await seedGroupCoachWithSlots(svc.id, "Coach Group", 2);
    const [slot] = await listAvailableCoachingSlotsWithSeats(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });

    const a = await seedParentChild();
    const b = await seedParentChild();
    const c = await seedParentChild();
    await bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId: a.parentId, childId: a.childId, staffId: coach.id });
    await bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId: b.parentId, childId: b.childId, staffId: coach.id });

    // The 3rd seat is rejected — the group session is full.
    await expect(
      bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId: c.parentId, childId: c.childId, staffId: coach.id }),
    ).rejects.toBeInstanceOf(CoachingSlotFullError);

    // A full slot (0 seats remaining) is not offered in the seats availability.
    const remaining = await listAvailableCoachingSlotsWithSeats(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    expect(remaining.map((s) => s.id)).not.toContain(slot!.id);
  });

  it("each booked seat raises its own pending invoice + attribution (AC3)", async () => {
    const svc = await priceGroupCoaching(4, 3000);
    const coach = await seedGroupCoachWithSlots(svc.id, "Coach Group", 4);
    const [slot] = await listAvailableCoachingSlotsWithSeats(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });

    const a = await seedParentChild();
    const b = await seedParentChild();
    const ra = await bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId: a.parentId, childId: a.childId, staffId: coach.id });
    const rb = await bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId: b.parentId, childId: b.childId, staffId: coach.id });
    expect(ra.invoiceId).not.toBe(rb.invoiceId);

    for (const r of [ra, rb]) {
      const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, r.invoiceId));
      expect(inv!.status).toBe("pending");
      expect(inv!.amountDue).toBe(3000);
      const [bk] = await dbh.db.select().from(bookings).where(eq(bookings.id, r.bookingId));
      expect(bk!.coachingSlotId).toBe(slot!.id);
      expect(bk!.staffId).toBe(coach.id);
      expect(bk!.staffNameSnapshot).toBe("Coach Group");
    }

    // Two bookings → two seats consumed; both audited booking.created.
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "booking.created"));
    expect(audits.length).toBe(2);
  });

  it("a 1:1 (capacity 1) slot still rejects a second booker with CoachingSlotTakenError (AC1 unchanged)", async () => {
    const svc = await createService(dbh.db, {
      name: "Sleep 1:1",
      unit: "coaching",
      attributionRoleRequired: "coach",
      format: "one_to_one",
      coachingDurationMinutes: 60,
    });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 5000, effectiveFrom: "2020-01-01" });
    const coach = await createStaff(dbh.db, { displayName: "Coach Solo", role: "coach" });
    const avail = await createStaffAvailability(dbh.db, {
      staffId: coach.id,
      dayOfWeek: dayOfWeekIso(FROM),
      startTime: "09:00",
      endTime: "10:00",
      effectiveFrom: FROM,
    });
    await generateCoachingSlotsForAvailability(dbh.db, avail, {
      fromDate: FROM,
      days: 1,
      services: [{ id: svc.id, coachingDurationMinutes: 60 }],
    });
    const [slot] = await listAvailableCoachingSlots(dbh.db, { serviceId: svc.id, fromDate: FROM, toDate: FROM });
    const a = await seedParentChild();
    const b = await seedParentChild();
    await bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId: a.parentId, childId: a.childId, staffId: coach.id });
    await expect(
      bookCoachingSlot(dbh.db, { coachingSlotId: slot!.id, parentId: b.parentId, childId: b.childId, staffId: coach.id }),
    ).rejects.toBeInstanceOf(CoachingSlotTakenError);
  });
});
