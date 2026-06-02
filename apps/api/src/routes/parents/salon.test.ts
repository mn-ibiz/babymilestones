import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, bookings, children, invoices, parents, smsOutbox, users } from "@bm/db";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import {
  createService,
  createStaff,
  createStaffAvailability,
  dayOfWeekIso,
  generateSalonSlotsForAvailability,
  setServicePrice,
  setStaffActive,
  updateService,
} from "@bm/catalog";
import { buildApp } from "../../app.js";

/**
 * P3-E03-S02 (Story 25.2) — parent picks a service → stylist → date → slot, then
 * confirms. Integration via app.inject with a fixed clock (2026-06-15 05:00Z, a
 * Monday). Covers the stylist-filtered availability (AC1/AC2), least-busy
 * resolution for "Any available" (AC3), and confirm → booking + pending invoice +
 * attribution (AC4).
 */
const FIXED = Date.parse("2026-06-15T05:00:00.000Z");
const FROM = "2026-06-15"; // Monday — dayOfWeekIso === 1.

describe("parent salon booking (P3-E03-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;

  async function makeParent(phone: string, rawPhone: string) {
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: await hashPin("1357") }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Amina", lastName: "Otieno" }).returning();
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { phone: rawPhone, pin: "1357" } });
    const cookies = login.headers["set-cookie"] as string[];
    const sessionCookie = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { userId: u!.id, parentId: p!.id, sessionCookie, csrfCookie, csrfToken: login.json().csrfToken as string };
  }
  type Parent = Awaited<ReturnType<typeof makeParent>>;

  async function addChild(parentId: string, dateOfBirth = "2022-01-01") {
    const [c] = await dbh.db.insert(children).values({ parentId, firstName: "Zola", dateOfBirth }).returning();
    return c!.id;
  }

  /** A priced salon service with a 60-min duration. */
  async function seedSalonService(name = "Kids Cut", priceCents = 2500) {
    const svc = await createService(dbh.db, { name, unit: "salon" });
    await updateService(dbh.db, svc.id, { salonDurationMinutes: 60 });
    if (priceCents >= 0) {
      await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: priceCents, effectiveFrom: "2026-01-01" });
    }
    return svc;
  }

  /** A stylist with a Monday 09:00–12:00 window that materialises slots on FROM. */
  async function seedStylist(serviceId: string, displayName: string) {
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

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore(), now: () => FIXED });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const availability = (p: Parent, serviceId: string, staffId?: string) =>
    app.inject({
      method: "GET",
      url: `/parents/me/salon/services/${serviceId}/availability${staffId ? `?staffId=${staffId}` : ""}`,
      headers: { cookie: p.sessionCookie },
    });

  const leastBusy = (p: Parent, serviceId: string, date: string) =>
    app.inject({
      method: "GET",
      url: `/parents/me/salon/services/${serviceId}/least-busy?date=${date}`,
      headers: { cookie: p.sessionCookie },
    });

  const confirm = (p: Parent, body: Record<string, unknown>, csrf = true) =>
    app.inject({
      method: "POST",
      url: "/parents/me/salon/bookings",
      headers: {
        cookie: csrf ? `${p.sessionCookie}; ${p.csrfCookie}` : p.sessionCookie,
        ...(csrf ? { "x-csrf-token": p.csrfToken } : {}),
      },
      payload: body,
    });

  it("lists stylists + slots, and filters to a chosen stylist (AC1/AC2)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    const bree = await seedStylist(svc.id, "Bree");

    const all = await availability(parent, svc.id);
    expect(all.statusCode).toBe(200);
    const allBody = all.json();
    expect(allBody.stylists.map((s: { id: string }) => s.id).sort()).toEqual([asha.id, bree.id].sort());
    expect(allBody.staffId).toBeNull();
    expect(new Set(allBody.slots.map((s: { staffId: string }) => s.staffId))).toEqual(new Set([asha.id, bree.id]));

    const onlyAsha = await availability(parent, svc.id, asha.id);
    const ashaBody = onlyAsha.json();
    expect(ashaBody.staffId).toBe(asha.id);
    expect(ashaBody.slots.every((s: { staffId: string }) => s.staffId === asha.id)).toBe(true);
    expect(ashaBody.slots.length).toBeGreaterThan(0);
  });

  it("404s availability for a non-salon or unknown service", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const play = await createService(dbh.db, { name: "Play", unit: "play" });
    expect((await availability(parent, play.id)).statusCode).toBe(404);
  });

  it("confirms a specific-stylist booking → booking + pending invoice + attribution + SMS + audit (AC4)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId);
    const svc = await seedSalonService("Kids Cut", 2500);
    const asha = await seedStylist(svc.id, "Asha");
    const slot = (await availability(parent, svc.id, asha.id)).json().slots[0];

    const res = await confirm(parent, { salonSlotId: slot.id, childId, staffId: asha.id });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.amountCents).toBe(2500);
    expect(body.staffId).toBe(asha.id);

    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, body.invoiceId));
    expect(inv!.status).toBe("pending");
    expect(inv!.amountDue).toBe(2500);

    const [bk] = await dbh.db.select().from(bookings).where(eq(bookings.id, body.bookingId));
    expect(bk!.salonSlotId).toBe(slot.id);
    expect(bk!.staffId).toBe(asha.id);
    expect(bk!.staffNameSnapshot).toBe("Asha");

    const sms = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, "booking.confirmed"));
    expect(sms).toHaveLength(1);
    expect(sms[0]!.body).toContain("Zola");

    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "booking.created"));
    expect(audits).toHaveLength(1);
  });

  it('resolves the least-busy stylist for "Any available" and books their slot (AC3/AC4)', async () => {
    const a = await makeParent("+254712345678", "0712345678");
    const childA = await addChild(a.parentId);
    const b = await makeParent("+254712000099", "0712000099");
    const childB = await addChild(b.parentId);
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    const bree = await seedStylist(svc.id, "Bree");

    // Pre-book one of Asha's slots so Bree becomes least-busy.
    const ashaSlot = (await availability(a, svc.id, asha.id)).json().slots[0];
    expect((await confirm(a, { salonSlotId: ashaSlot.id, childId: childA, staffId: asha.id })).statusCode).toBe(201);

    const lb = await leastBusy(b, svc.id, FROM);
    expect(lb.statusCode).toBe(200);
    expect(lb.json().staffId).toBe(bree.id);

    // "Any available": confirm against the resolved stylist's slot, no staffId.
    const breeSlot = (await availability(b, svc.id, bree.id)).json().slots[0];
    const res = await confirm(b, { salonSlotId: breeSlot.id, childId: childB });
    expect(res.statusCode).toBe(201);
    expect(res.json().staffId).toBe(bree.id);
  });

  it("404s least-busy when no stylist is available that date (AC3)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    await setStaffActive(dbh.db, asha.id, false); // retired — none available
    expect((await leastBusy(parent, svc.id, FROM)).statusCode).toBe(404);
  });

  it("409s a double-book of the same salon slot (AC4)", async () => {
    const a = await makeParent("+254712345678", "0712345678");
    const childA = await addChild(a.parentId);
    const b = await makeParent("+254712000099", "0712000099");
    const childB = await addChild(b.parentId);
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    const slot = (await availability(a, svc.id, asha.id)).json().slots[0];

    expect((await confirm(a, { salonSlotId: slot.id, childId: childA, staffId: asha.id })).statusCode).toBe(201);
    const second = await confirm(b, { salonSlotId: slot.id, childId: childB, staffId: asha.id });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatch(/just taken/i);
  });

  it("409s a stylist pick that doesn't match the slot (AC2)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId);
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    const bree = await seedStylist(svc.id, "Bree");
    const ashaSlot = (await availability(parent, svc.id, asha.id)).json().slots[0];
    const res = await confirm(parent, { salonSlotId: ashaSlot.id, childId, staffId: bree.id });
    expect(res.statusCode).toBe(409);
  });

  it("409s when the service has no price (AC4)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId);
    const svc = await seedSalonService("Unpriced", -1); // no price seeded
    const asha = await seedStylist(svc.id, "Asha");
    const slot = (await availability(parent, svc.id, asha.id)).json().slots[0];
    const res = await confirm(parent, { salonSlotId: slot.id, childId, staffId: asha.id });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/no price/i);
  });

  it("404s a child the parent does not own", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const other = await makeParent("+254712000099", "0712000099");
    const otherChild = await addChild(other.parentId);
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    const slot = (await availability(parent, svc.id, asha.id)).json().slots[0];
    const res = await confirm(parent, { salonSlotId: slot.id, childId: otherChild, staffId: asha.id });
    expect(res.statusCode).toBe(404);
  });

  it("rejects confirm without CSRF (403) and unauthenticated (401)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId);
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    const slot = (await availability(parent, svc.id, asha.id)).json().slots[0];
    expect((await confirm(parent, { salonSlotId: slot.id, childId, staffId: asha.id }, false)).statusCode).toBe(403);
    const anon = await app.inject({ method: "POST", url: "/parents/me/salon/bookings", payload: { salonSlotId: slot.id, childId } });
    expect(anon.statusCode).toBe(401);
  });
});
