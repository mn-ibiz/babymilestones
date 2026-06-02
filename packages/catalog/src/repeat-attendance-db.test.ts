import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import {
  attendances,
  bookings,
  children,
  events,
  invoices,
  parents,
  services,
  tickets,
  ticketOrders,
  eventTicketTiers,
  users,
} from "@bm/db";
import { loadRepeatAttendance } from "./repeat-attendance-db.js";

/**
 * P6-E06-S03 (Story 35.3) — DB read behind the repeat-attendance report. DB-backed
 * via the PGlite harness. Verifies the read assembles the window's attendance
 * records from BOTH signals — door-checked-in event tickets (keyed on the buyer
 * phone) and attended class-type bookings (`talent`/`coaching`, keyed on parentId) —
 * applies the `[from, to]` date filter (AC2), and hands them to the pure reducer.
 *
 * Window boundaries are UTC `[from 00:00, (to+1) 00:00)`.
 */
describe("loadRepeatAttendance (Story 35.3)", () => {
  let dbh: TestDb;
  let phoneSeq = 0;
  const nextPhone = () => `+25472${String(5_000_000 + phoneSeq++).padStart(7, "0")}`;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedFamily() {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Pat", lastName: "Doe" })
      .returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Kid", dateOfBirth: "2022-01-01" })
      .returning();
    return { parentId: p!.id, childId: c!.id };
  }

  /** Seed a class-type booking + its attendance check-in. */
  async function seedClassAttendance(opts: {
    parentId: string;
    childId: string;
    serviceId: string;
    checkedInAt: Date;
    status?: string;
  }) {
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId: opts.parentId, amountDue: 0, serviceId: opts.serviceId })
      .returning();
    const [b] = await dbh.db
      .insert(bookings)
      .values({
        parentId: opts.parentId,
        childId: opts.childId,
        serviceId: opts.serviceId,
        staffNameSnapshot: "Staff",
        staffRateSnapshot: 0,
        invoiceId: inv!.id,
        status: opts.status ?? "confirmed",
        checkedInAt: opts.checkedInAt,
      })
      .returning();
    await dbh.db.insert(attendances).values({ bookingId: b!.id, checkedInAt: opts.checkedInAt });
    return b!.id;
  }

  /** Seed an event with one tier; return ids. */
  async function seedEvent(opts: { name: string; startsAt: Date }) {
    const [ev] = await dbh.db
      .insert(events)
      .values({
        name: opts.name,
        slug: `${opts.name.toLowerCase().replace(/\s+/g, "-")}-${phoneSeq++}`,
        unit: "general",
        startsAt: opts.startsAt,
        endsAt: new Date(opts.startsAt.getTime() + 3_600_000),
        capacity: 100,
        published: true,
      })
      .returning();
    const [tier] = await dbh.db
      .insert(eventTicketTiers)
      .values({ eventId: ev!.id, name: "GA", priceCents: 0, allotment: 100 })
      .returning();
    return { eventId: ev!.id, tierId: tier!.id };
  }

  /** Seed a (door-checked-in) ticket for an event, keyed on the buyer phone. */
  async function seedTicket(opts: {
    eventId: string;
    tierId: string;
    buyerPhone: string;
    checkedInAt: Date | null;
  }) {
    const [order] = await dbh.db
      .insert(ticketOrders)
      .values({
        eventId: opts.eventId,
        tierId: opts.tierId,
        buyerName: "Buyer",
        buyerPhone: opts.buyerPhone,
        quantity: 1,
        amountCents: 0,
        status: "free",
      })
      .returning();
    await dbh.db.insert(tickets).values({
      code: `T-${phoneSeq++}`,
      orderId: order!.id,
      eventId: opts.eventId,
      tierId: opts.tierId,
      buyerName: "Buyer",
      buyerPhone: opts.buyerPhone,
      status: opts.checkedInAt ? "checked_in" : "issued",
      checkedInAt: opts.checkedInAt,
    });
  }

  it("returns an empty report for an empty window (AC1)", async () => {
    const out = await loadRepeatAttendance(dbh.db, { from: "2026-06-01", to: "2026-06-30" });
    expect(out.classes).toEqual([]);
    expect(out.summary.totalAttendees).toBe(0);
  });

  it("counts attended class bookings (talent/coaching), marking a multi-class parent a repeat (AC1)", async () => {
    const [talent] = await dbh.db.insert(services).values({ name: "Music", unit: "talent" }).returning();
    const [coaching] = await dbh.db
      .insert(services)
      .values({ name: "Maths", unit: "coaching", format: "group" })
      .returning();
    const fam1 = await seedFamily();
    const fam2 = await seedFamily();
    // p1 attends BOTH classes; p2 attends only the talent class.
    await seedClassAttendance({ ...fam1, serviceId: talent!.id, checkedInAt: new Date("2026-06-10T10:00:00Z") });
    await seedClassAttendance({ ...fam1, serviceId: coaching!.id, checkedInAt: new Date("2026-06-12T10:00:00Z") });
    await seedClassAttendance({ ...fam2, serviceId: talent!.id, checkedInAt: new Date("2026-06-11T10:00:00Z") });

    const out = await loadRepeatAttendance(dbh.db, { from: "2026-06-01", to: "2026-06-30" });

    const talentRow = out.classes.find((c) => c.label === "Music")!;
    const coachingRow = out.classes.find((c) => c.label === "Maths")!;
    // Talent: p1 + p2 → 2 attendees; p1 is a repeat → 50%.
    expect(talentRow.totalAttendees).toBe(2);
    expect(talentRow.repeatAttendeePct).toBe(50);
    // Coaching: p1 only → 1 attendee; p1 is a repeat → 100%.
    expect(coachingRow.totalAttendees).toBe(1);
    expect(coachingRow.repeatAttendeePct).toBe(100);
  });

  it("counts door-checked-in event tickets, keyed on the buyer phone (AC1)", async () => {
    const ev = await seedEvent({ name: "Recital", startsAt: new Date("2026-06-15T17:00:00Z") });
    // Two distinct buyers checked in; one issued-but-not-checked-in (ignored).
    await seedTicket({ ...ev, buyerPhone: "+254700000001", checkedInAt: new Date("2026-06-15T17:05:00Z") });
    await seedTicket({ ...ev, buyerPhone: "+254700000002", checkedInAt: new Date("2026-06-15T17:06:00Z") });
    await seedTicket({ ...ev, buyerPhone: "+254700000003", checkedInAt: null });

    const out = await loadRepeatAttendance(dbh.db, { from: "2026-06-01", to: "2026-06-30" });
    const recital = out.classes.find((c) => c.label.includes("Recital"))!;
    expect(recital).toBeDefined();
    expect(recital.totalAttendees).toBe(2);
  });

  it("treats an event + a class as DISTINCT classes, marking a parent who did both a repeat", async () => {
    // Same buyer phone is the booking parent's phone, so the SAME identity attends both.
    const [u] = await dbh.db.insert(users).values({ phone: "+254700000099", pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Dee", lastName: "Bo" })
      .returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Kid", dateOfBirth: "2022-01-01" })
      .returning();
    const [talent] = await dbh.db.insert(services).values({ name: "Dance", unit: "talent" }).returning();
    await seedClassAttendance({
      parentId: p!.id,
      childId: c!.id,
      serviceId: talent!.id,
      checkedInAt: new Date("2026-06-10T10:00:00Z"),
    });
    const ev = await seedEvent({ name: "Gala", startsAt: new Date("2026-06-15T17:00:00Z") });
    await seedTicket({ ...ev, buyerPhone: "+254700000099", checkedInAt: new Date("2026-06-15T17:05:00Z") });

    const out = await loadRepeatAttendance(dbh.db, { from: "2026-06-01", to: "2026-06-30" });
    // The parent attended 2 distinct classes → a repeat in both rows.
    expect(out.summary.totalClasses).toBe(2);
    expect(out.summary.totalAttendees).toBe(1);
    expect(out.summary.repeatAttendees).toBe(1);
    expect(out.classes.every((r) => r.repeatAttendeePct === 100)).toBe(true);
  });

  it("excludes attendances outside the window (AC2 date filter)", async () => {
    const [talent] = await dbh.db.insert(services).values({ name: "Art", unit: "talent" }).returning();
    const fam = await seedFamily();
    // In window.
    await seedClassAttendance({ ...fam, serviceId: talent!.id, checkedInAt: new Date("2026-06-10T10:00:00Z") });
    // Out of window (before).
    await seedClassAttendance({ ...fam, serviceId: talent!.id, checkedInAt: new Date("2026-05-10T10:00:00Z") });

    const out = await loadRepeatAttendance(dbh.db, { from: "2026-06-01", to: "2026-06-30" });
    const art = out.classes.find((c) => c.label === "Art")!;
    expect(art.totalAttendees).toBe(1);
    expect(out.summary.totalAttendees).toBe(1);

    // Tighten the window so the in-window day is excluded too → empty.
    const empty = await loadRepeatAttendance(dbh.db, { from: "2026-06-20", to: "2026-06-30" });
    expect(empty.classes).toEqual([]);
  });

  it("ignores cancelled class bookings + only counts checked-in attendances", async () => {
    const [talent] = await dbh.db.insert(services).values({ name: "Drums", unit: "talent" }).returning();
    const fam = await seedFamily();
    await seedClassAttendance({
      ...fam,
      serviceId: talent!.id,
      checkedInAt: new Date("2026-06-10T10:00:00Z"),
      status: "cancelled",
    });
    const out = await loadRepeatAttendance(dbh.db, { from: "2026-06-01", to: "2026-06-30" });
    expect(out.classes).toEqual([]);
  });

  it("ignores non-class bookings (play/salon)", async () => {
    const [play] = await dbh.db.insert(services).values({ name: "Creche", unit: "play" }).returning();
    const [salon] = await dbh.db.insert(services).values({ name: "Cut", unit: "salon" }).returning();
    const fam = await seedFamily();
    await seedClassAttendance({ ...fam, serviceId: play!.id, checkedInAt: new Date("2026-06-10T10:00:00Z") });
    await seedClassAttendance({ ...fam, serviceId: salon!.id, checkedInAt: new Date("2026-06-11T10:00:00Z") });
    const out = await loadRepeatAttendance(dbh.db, { from: "2026-06-01", to: "2026-06-30" });
    expect(out.classes).toEqual([]);
  });
});
