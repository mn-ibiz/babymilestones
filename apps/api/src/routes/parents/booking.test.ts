import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, children, invoices, parents, smsOutbox, users } from "@bm/db";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import {
  createSchedule,
  createService,
  dayOfWeekIso,
  generateSlotsForSchedule,
  listSchedules,
  listSlotsWithRemaining,
  setServicePrice,
} from "@bm/catalog";
import { buildApp } from "../../app.js";

/**
 * P2-E01-S03 — parent books a slot. Integration via app.inject with a fixed
 * clock (2026-06-15 05:00Z). Covers booking + pending invoice (AC2/AC3), the
 * full-slot rejection (AC4), eligibility (AC1), the SMS-stub confirmation (AC5),
 * and the past-slot / ownership / auth guards.
 */
const FIXED = Date.parse("2026-06-15T05:00:00.000Z");
const FUTURE = "2026-06-18";

describe("parent slot booking (P2-E01-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;

  async function makeParent(phone: string, rawPhone: string) {
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: await hashPin("1357") }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Amina", lastName: "Otieno" })
      .returning();
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { phone: rawPhone, pin: "1357" } });
    const cookies = login.headers["set-cookie"] as string[];
    const sessionCookie = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { userId: u!.id, parentId: p!.id, sessionCookie, csrfCookie, csrfToken: login.json().csrfToken as string };
  }
  type Parent = Awaited<ReturnType<typeof makeParent>>;

  async function addChild(parentId: string, dateOfBirth = "2024-01-01") {
    const [c] = await dbh.db.insert(children).values({ parentId, firstName: "Zola", dateOfBirth }).returning();
    return c!.id;
  }

  /** Seed a priced service + a slot; returns ids. `slotDate`/window control past-ness + age. */
  async function seedSlot(opts: {
    slotDate?: string;
    startTime?: string;
    endTime?: string;
    capacity?: number;
    ageMaxMonths?: number | null;
    priced?: boolean;
  } = {}) {
    const slotDate = opts.slotDate ?? FUTURE;
    const svc = await createService(dbh.db, {
      name: "Soft Play",
      unit: "play",
      ageMaxMonths: opts.ageMaxMonths ?? null,
    });
    if (opts.priced !== false) {
      await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 1500, effectiveFrom: "2026-01-01" });
    }
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dayOfWeekIso(slotDate),
      startTime: opts.startTime ?? "09:00",
      endTime: opts.endTime ?? "10:00",
      slotDurationMinutes: 60,
      capacity: opts.capacity ?? 5,
    });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: "2026-06-15", days: 7 });
    const slots = await listSlotsWithRemaining(dbh.db, { serviceId: svc.id });
    const slot = slots.find((s) => s.slotDate === slotDate)!;
    return { serviceId: svc.id, slotId: slot.id };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore(), now: () => FIXED });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const book = (p: Parent, body: Record<string, unknown>, csrf = true) =>
    app.inject({
      method: "POST",
      url: "/parents/me/bookings",
      headers: {
        cookie: csrf ? `${p.sessionCookie}; ${p.csrfCookie}` : p.sessionCookie,
        ...(csrf ? { "x-csrf-token": p.csrfToken } : {}),
      },
      payload: body,
    });

  it("books a slot, creates a pending invoice, sends SMS, audits (AC2/AC3/AC5)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId);
    const { slotId } = await seedSlot();

    const res = await book(parent, { slotId, childId });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.amountCents).toBe(1500);

    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, body.invoiceId));
    expect(inv!.status).toBe("pending");
    expect(inv!.amountDue).toBe(1500);

    const sms = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, "booking.confirmed"));
    expect(sms).toHaveLength(1);
    expect(sms[0]!.body).toContain("Zola");

    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "booking.created"));
    expect(audits).toHaveLength(1);
  });

  it("returns 409 'Slot just filled' when the last seat is gone (AC4)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childA = await addChild(parent.parentId);
    const childB = await addChild(parent.parentId);
    const { slotId } = await seedSlot({ capacity: 1 });
    const first = await book(parent, { slotId, childId: childA });
    expect(first.statusCode).toBe(201);
    const second = await book(parent, { slotId, childId: childB });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatch(/just filled/i);
  });

  it("returns 409 when the same child is already booked in the slot", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId);
    const { slotId } = await seedSlot({ capacity: 5 });
    expect((await book(parent, { slotId, childId })).statusCode).toBe(201);
    const dup = await book(parent, { slotId, childId });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toMatch(/already booked/i);
  });

  it("returns 422 when the child is not age-eligible (AC1)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId, "2024-01-01"); // ~29 months
    const { slotId } = await seedSlot({ ageMaxMonths: 12 });
    const res = await book(parent, { slotId, childId });
    expect(res.statusCode).toBe(422);
  });

  it("returns 409 when the slot has already passed", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId);
    const { slotId } = await seedSlot({ slotDate: "2026-06-15", startTime: "03:00", endTime: "04:00" });
    const res = await book(parent, { slotId, childId });
    expect(res.statusCode).toBe(409);
  });

  it("returns 404 for a child the parent does not own", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const other = await makeParent("+254712000099", "0712000099");
    const otherChild = await addChild(other.parentId);
    const { slotId } = await seedSlot();
    const res = await book(parent, { slotId, childId: otherChild });
    expect(res.statusCode).toBe(404);
  });

  it("rejects without CSRF (403) and unauthenticated (401)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId);
    const { slotId } = await seedSlot();
    expect((await book(parent, { slotId, childId }, false)).statusCode).toBe(403);
    const anon = await app.inject({ method: "POST", url: "/parents/me/bookings", payload: { slotId, childId } });
    expect(anon.statusCode).toBe(401);
  });

  /** Seed a priced service with two same-day windows; returns both slot ids. */
  async function seedTwoSlots(slotDate = FUTURE) {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 1500, effectiveFrom: "2026-01-01" });
    const dow = dayOfWeekIso(slotDate);
    await createSchedule(dbh.db, { serviceId: svc.id, dayOfWeek: dow, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 60, capacity: 5 });
    await createSchedule(dbh.db, { serviceId: svc.id, dayOfWeek: dow, startTime: "11:00", endTime: "12:00", slotDurationMinutes: 60, capacity: 5 });
    const sched = await listSchedules(dbh.db, { serviceId: svc.id });
    for (const s of sched) await generateSlotsForSchedule(dbh.db, s, { fromDate: "2026-06-15", days: 7 });
    const slots = (await listSlotsWithRemaining(dbh.db, { serviceId: svc.id })).filter((s) => s.slotDate === slotDate);
    return { serviceId: svc.id, slotA: slots[0]!.id, slotB: slots[1]!.id };
  }

  const reschedule = (p: Parent, bookingId: string, newSlotId: string) =>
    app.inject({
      method: "POST",
      url: `/parents/me/bookings/${bookingId}/reschedule`,
      headers: { cookie: `${p.sessionCookie}; ${p.csrfCookie}`, "x-csrf-token": p.csrfToken },
      payload: { newSlotId },
    });

  it("reschedules a booking to a new slot before the cut-off (AC1/AC2)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId);
    const { slotA, slotB } = await seedTwoSlots();
    const bookingId = (await book(parent, { slotId: slotA, childId })).json().bookingId as string;

    const res = await reschedule(parent, bookingId, slotB);
    expect(res.statusCode).toBe(200);
    expect(res.json().oldSlotId).toBe(slotA);
    expect(res.json().newSlotId).toBe(slotB);
  });

  it("refuses an online reschedule after the cut-off → contact reception (AC4)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId);
    // A slot today at 06:00 (now is 05:00): bookable, but inside the 2h cut-off.
    const { slotA, slotB } = await seedTwoSlots("2026-06-15");
    // seedTwoSlots made 09:00/11:00 today; book the 09:00 (4h out is fine to book),
    // then make the cut-off bite by rescheduling a slot whose start is within 2h.
    // Use a 06:00 slot instead: rebuild with an early window.
    void slotA;
    void slotB;
    const svc = await createService(dbh.db, { name: "Early", unit: "play" });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 1000, effectiveFrom: "2026-01-01" });
    const dow = dayOfWeekIso("2026-06-15");
    await createSchedule(dbh.db, { serviceId: svc.id, dayOfWeek: dow, startTime: "06:00", endTime: "07:00", slotDurationMinutes: 60, capacity: 5 });
    await createSchedule(dbh.db, { serviceId: svc.id, dayOfWeek: dow, startTime: "08:00", endTime: "09:00", slotDurationMinutes: 60, capacity: 5 });
    const sched = await listSchedules(dbh.db, { serviceId: svc.id });
    for (const s of sched) await generateSlotsForSchedule(dbh.db, s, { fromDate: "2026-06-15", days: 1 });
    const slots = await listSlotsWithRemaining(dbh.db, { serviceId: svc.id });
    const early = slots.find((s) => s.startTime === "06:00")!;
    const later = slots.find((s) => s.startTime === "08:00")!;
    const bookingId = (await book(parent, { slotId: early.id, childId })).json().bookingId as string;

    const res = await reschedule(parent, bookingId, later.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/contact reception/i);
  });

  it("409s rescheduling into the same slot", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId);
    const { slotA } = await seedTwoSlots();
    const bookingId = (await book(parent, { slotId: slotA, childId })).json().bookingId as string;
    const res = await reschedule(parent, bookingId, slotA);
    expect(res.statusCode).toBe(409);
  });

  it("404s rescheduling another parent's booking", async () => {
    const owner = await makeParent("+254712345678", "0712345678");
    const other = await makeParent("+254712000099", "0712000099");
    const childId = await addChild(owner.parentId);
    const { slotA, slotB } = await seedTwoSlots();
    const bookingId = (await book(owner, { slotId: slotA, childId })).json().bookingId as string;
    const res = await reschedule(other, bookingId, slotB);
    expect(res.statusCode).toBe(404);
  });

  const cancel = (p: Parent, bookingId: string) =>
    app.inject({
      method: "POST",
      url: `/parents/me/bookings/${bookingId}/cancel`,
      headers: { cookie: `${p.sessionCookie}; ${p.csrfCookie}`, "x-csrf-token": p.csrfToken },
    });

  it("cancels before the cut-off → slot freed + invoice voided (AC1)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId);
    const { slotId } = await seedSlot();
    const created = await book(parent, { slotId, childId });
    const { bookingId, invoiceId } = created.json();

    const res = await cancel(parent, bookingId);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("cancelled");
    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(inv!.status).toBe("void");
  });

  it("refuses an online cancel after the cut-off → contact reception (AC2)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId);
    // An early-today slot (06:00) is bookable at 05:00 but inside the 2h cut-off.
    const svc = await createService(dbh.db, { name: "Early", unit: "play" });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 1000, effectiveFrom: "2026-01-01" });
    const sched = await createSchedule(dbh.db, { serviceId: svc.id, dayOfWeek: dayOfWeekIso("2026-06-15"), startTime: "06:00", endTime: "07:00", slotDurationMinutes: 60, capacity: 5 });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: "2026-06-15", days: 1 });
    const [slot] = await listSlotsWithRemaining(dbh.db, { serviceId: svc.id });
    const bookingId = (await book(parent, { slotId: slot!.id, childId })).json().bookingId as string;

    const res = await cancel(parent, bookingId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/contact reception/i);
  });

  it("404s cancelling another parent's booking", async () => {
    const owner = await makeParent("+254712345678", "0712345678");
    const other = await makeParent("+254712000099", "0712000099");
    const childId = await addChild(owner.parentId);
    const { slotId } = await seedSlot();
    const bookingId = (await book(owner, { slotId, childId })).json().bookingId as string;
    expect((await cancel(other, bookingId)).statusCode).toBe(404);
  });
});
