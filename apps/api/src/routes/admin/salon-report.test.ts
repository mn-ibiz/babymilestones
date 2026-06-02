import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { attendances, bookings } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import {
  bookSalonSlot,
  createService,
  createStaff,
  createStaffAvailability,
  generateSalonSlotsForAvailability,
  listAvailableSalonSlots,
  setServicePrice,
  updateService,
} from "@bm/catalog";
import { children, parents, users } from "@bm/db";
import { dayOfWeekIso } from "@bm/catalog";
import { buildApp } from "../../app.js";

/**
 * P3-E03-S05 (Story 25.5) — admin salon-report API. Integration via app.inject
 * with real staff sessions (+ CSRF). The report is read-only and gated on
 * `read report` (admin / accountant / treasury / super_admin), exactly like the
 * other admin reporting surfaces (commission runs). No-show derivation is fixed
 * with an injected clock so the day's slots have already passed.
 *
 *   GET /admin/salon-report?date=YYYY-MM-DD  — tile totals (AC1) + per-stylist (AC2)
 */

const FROM = "2026-06-15"; // a Monday
let phoneSeq = 0;
const nextPhone = () => `+25471${String(4_000_000 + phoneSeq++).padStart(7, "0")}`;

describe("Admin salon-report API (P3-E03-S05)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const get = (url: string, creds: Creds) =>
    app.inject({ method: "GET", url, headers: { cookie: [creds.session, creds.csrfCookie].join("; ") } });

  async function seedService(priceCents = 2500) {
    const svc = await createService(dbh.db, { name: "Kids Cut", unit: "salon" });
    await updateService(dbh.db, svc.id, { salonDurationMinutes: 60 });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: priceCents, effectiveFrom: "2026-01-01" });
    return svc;
  }

  async function seedStylistWithSlots(serviceId: string, name: string) {
    const stylist = await createStaff(dbh.db, { displayName: name, role: "stylist" });
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
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Pat", lastName: "Doe" }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Kid", dateOfBirth: "2022-01-01" }).returning();
    return { parentId: p!.id, childId: c!.id };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    // Fix the clock to the afternoon of FROM so the morning slots have passed.
    app = buildApp({ db: dbh.db, sessions, now: () => Date.parse(`${FROM}T15:00:00Z`) });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("returns today's tile totals + per-stylist drill-down (AC1/AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = await seedService(2500);
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const bree = await seedStylistWithSlots(svc.id, "Bree");
    const fam = await seedParentChild();

    const ashaSlots = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: asha.id, fromDate: FROM, toDate: FROM });
    const breeSlots = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: bree.id, fromDate: FROM, toDate: FROM });
    // Asha booking 1: checked in (not a no-show).
    const a1 = await bookSalonSlot(dbh.db, { salonSlotId: ashaSlots[0]!.id, parentId: fam.parentId, childId: fam.childId, staffId: asha.id });
    await dbh.db.insert(attendances).values({ bookingId: a1.bookingId, checkedInBy: null });
    // Asha booking 2: never checked in, slot passed → no-show.
    await bookSalonSlot(dbh.db, { salonSlotId: ashaSlots[1]!.id, parentId: fam.parentId, childId: fam.childId, staffId: asha.id });
    // Bree booking: checked in.
    const b1 = await bookSalonSlot(dbh.db, { salonSlotId: breeSlots[0]!.id, parentId: fam.parentId, childId: fam.childId, staffId: bree.id });
    await dbh.db.insert(attendances).values({ bookingId: b1.bookingId, checkedInBy: null });

    const res = await get(`/admin/salon-report?date=${FROM}`, creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.date).toBe(FROM);
    expect(body.bookings).toBe(3);
    expect(body.noShows).toBe(1);
    expect(body.revenueCents).toBe(7500);

    expect(body.stylists).toHaveLength(2);
    const ashaStats = body.stylists.find((s: { staffId: string }) => s.staffId === asha.id);
    expect(ashaStats).toMatchObject({ staffName: "Asha", bookings: 2, noShows: 1, revenueCents: 5000 });
    const breeStats = body.stylists.find((s: { staffId: string }) => s.staffId === bree.id);
    expect(breeStats).toMatchObject({ staffName: "Bree", bookings: 1, noShows: 0, revenueCents: 2500 });
  });

  it("excludes cancelled bookings from the totals (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = await seedService(2500);
    const asha = await seedStylistWithSlots(svc.id, "Asha");
    const fam = await seedParentChild();
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: asha.id, fromDate: FROM, toDate: FROM });
    const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: fam.parentId, childId: fam.childId, staffId: asha.id });
    await dbh.db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, booked.bookingId));

    const res = await get(`/admin/salon-report?date=${FROM}`, creds);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ bookings: 0, noShows: 0, revenueCents: 0, stylists: [] });
  });

  it("zero-data day returns zeros (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await get(`/admin/salon-report?date=${FROM}`, creds);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ date: FROM, bookings: 0, noShows: 0, revenueCents: 0, stylists: [] });
  });

  it("defaults to the server clock's date when no date is given", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await get(`/admin/salon-report`, creds);
    expect(res.statusCode).toBe(200);
    expect(res.json().date).toBe(FROM);
  });

  it("403s a role without read-report (reception)", async () => {
    const creds = await loginStaff("+254712000003", "7423");
    const res = await get(`/admin/salon-report?date=${FROM}`, creds);
    expect(res.statusCode).toBe(403);
  });

  it("401s an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: `/admin/salon-report?date=${FROM}` });
    expect(res.statusCode).toBe(401);
  });
});
