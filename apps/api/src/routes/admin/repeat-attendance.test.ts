import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import {
  attendances,
  bookings,
  children,
  events,
  eventTicketTiers,
  invoices,
  parents,
  services,
  tickets,
  ticketOrders,
  users,
} from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P6-E06-S03 (Story 35.3) — repeat-attendance admin API. Integration via app.inject
 * with real staff sessions (+ CSRF). Returns the per-class repeat-attendance table
 * (AC1) over a date range (AC2). Gated to EXACTLY admin / super_admin / treasury
 * (same posture as the rest of the operations-dashboard surface) — accountant /
 * reception 403, unauth 401.
 *
 *   GET /admin/repeat-attendance?fromDate&toDate  — JSON report (AC1/AC2).
 */
describe("Admin repeat-attendance API (P6-E06-S03)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let seq = 0;
  const nextPhone = () => `+25473${String(6_000_000 + seq++).padStart(7, "0")}`;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const get = (url: string, creds: Creds) =>
    app.inject({
      method: "GET",
      url,
      headers: { cookie: [creds.session, creds.csrfCookie].join("; "), "x-csrf-token": creds.csrfToken },
    });

  async function seedFamily() {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Pat", lastName: "Doe" }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Kid", dateOfBirth: "2022-01-01" }).returning();
    return { parentId: p!.id, childId: c!.id };
  }

  async function seedClassAttendance(opts: { parentId: string; childId: string; serviceId: string; checkedInAt: Date }) {
    const [inv] = await dbh.db.insert(invoices).values({ parentId: opts.parentId, amountDue: 0, serviceId: opts.serviceId }).returning();
    const [b] = await dbh.db
      .insert(bookings)
      .values({
        parentId: opts.parentId,
        childId: opts.childId,
        serviceId: opts.serviceId,
        staffNameSnapshot: "Staff",
        staffRateSnapshot: 0,
        invoiceId: inv!.id,
        checkedInAt: opts.checkedInAt,
      })
      .returning();
    await dbh.db.insert(attendances).values({ bookingId: b!.id, checkedInAt: opts.checkedInAt });
  }

  async function seedEventCheckin(opts: { name: string; buyerPhone: string; checkedInAt: Date }) {
    const [ev] = await dbh.db
      .insert(events)
      .values({
        name: opts.name,
        slug: `${opts.name.toLowerCase().replace(/\s+/g, "-")}-${seq++}`,
        unit: "general",
        startsAt: opts.checkedInAt,
        endsAt: new Date(opts.checkedInAt.getTime() + 3_600_000),
        capacity: 100,
        published: true,
      })
      .returning();
    const [tier] = await dbh.db.insert(eventTicketTiers).values({ eventId: ev!.id, name: "GA", priceCents: 0, allotment: 100 }).returning();
    const [order] = await dbh.db
      .insert(ticketOrders)
      .values({ eventId: ev!.id, tierId: tier!.id, buyerName: "Buyer", buyerPhone: opts.buyerPhone, quantity: 1, amountCents: 0, status: "free" })
      .returning();
    await dbh.db.insert(tickets).values({
      code: `T-${seq++}`,
      orderId: order!.id,
      eventId: ev!.id,
      tierId: tier!.id,
      buyerName: "Buyer",
      buyerPhone: opts.buyerPhone,
      status: "checked_in",
      checkedInAt: opts.checkedInAt,
    });
    return ev!.id;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254713000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254713000002", "7422", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254713000004", "7424", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254713000005", "7425", "accountant"));
    await dbh.db.insert(users).values(await staffUserSeed("+254713000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("returns the per-class repeat-attendance table with correct metrics (AC1)", async () => {
    const creds = await loginStaff("+254713000001", "7421");
    const [music] = await dbh.db.insert(services).values({ name: "Music", unit: "talent" }).returning();
    const [maths] = await dbh.db.insert(services).values({ name: "Maths", unit: "coaching", format: "group" }).returning();
    const fam1 = await seedFamily();
    const fam2 = await seedFamily();
    // p1 attends BOTH classes (a repeat); p2 attends only Music.
    await seedClassAttendance({ ...fam1, serviceId: music!.id, checkedInAt: new Date("2026-06-10T10:00:00Z") });
    await seedClassAttendance({ ...fam1, serviceId: maths!.id, checkedInAt: new Date("2026-06-12T10:00:00Z") });
    await seedClassAttendance({ ...fam2, serviceId: music!.id, checkedInAt: new Date("2026-06-11T10:00:00Z") });

    const res = await get("/admin/repeat-attendance?fromDate=2026-06-01&toDate=2026-06-30", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.from).toBe("2026-06-01");
    expect(body.to).toBe("2026-06-30");

    const musicRow = body.classes.find((c: { label: string }) => c.label === "Music");
    const mathsRow = body.classes.find((c: { label: string }) => c.label === "Maths");
    // Music: 2 attendees (p1, p2); p1 is a repeat → 50%; avg = (2+1)/2 = 1.5.
    expect(musicRow.totalAttendees).toBe(2);
    expect(musicRow.repeatAttendeePct).toBe(50);
    expect(musicRow.avgClassesAttended).toBe(1.5);
    // Maths: 1 attendee (p1); a repeat → 100%; avg = 2.
    expect(mathsRow.totalAttendees).toBe(1);
    expect(mathsRow.repeatAttendeePct).toBe(100);
    expect(mathsRow.avgClassesAttended).toBe(2);

    // Summary: 2 distinct attendees; 1 repeat → 50%.
    expect(body.summary.totalClasses).toBe(2);
    expect(body.summary.totalAttendees).toBe(2);
    expect(body.summary.repeatAttendeePct).toBe(50);
  });

  it("includes door-checked-in events as classes (AC1)", async () => {
    const creds = await loginStaff("+254713000001", "7421");
    await seedEventCheckin({ name: "Recital", buyerPhone: "+254700000001", checkedInAt: new Date("2026-06-15T17:00:00Z") });
    await seedEventCheckin({ name: "Recital", buyerPhone: "+254700000002", checkedInAt: new Date("2026-06-15T17:00:00Z") });

    const res = await get("/admin/repeat-attendance?fromDate=2026-06-01&toDate=2026-06-30", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.classes.length).toBeGreaterThanOrEqual(1);
    expect(body.summary.totalAttendees).toBe(2);
  });

  it("applies the date filter (AC2)", async () => {
    const creds = await loginStaff("+254713000001", "7421");
    const [art] = await dbh.db.insert(services).values({ name: "Art", unit: "talent" }).returning();
    const fam = await seedFamily();
    await seedClassAttendance({ ...fam, serviceId: art!.id, checkedInAt: new Date("2026-06-10T10:00:00Z") });
    await seedClassAttendance({ ...fam, serviceId: art!.id, checkedInAt: new Date("2026-05-10T10:00:00Z") });

    // June window includes only the June attendance.
    const june = await get("/admin/repeat-attendance?fromDate=2026-06-01&toDate=2026-06-30", creds);
    expect(june.json().summary.totalAttendees).toBe(1);
    // A window with neither attendance is empty.
    const none = await get("/admin/repeat-attendance?fromDate=2026-07-01&toDate=2026-07-31", creds);
    expect(none.json().classes).toEqual([]);
  });

  it("400s an out-of-order date range", async () => {
    const creds = await loginStaff("+254713000001", "7421");
    const res = await get("/admin/repeat-attendance?fromDate=2026-06-30&toDate=2026-06-01", creds);
    expect(res.statusCode).toBe(400);
  });

  it("403s a reception user (RBAC)", async () => {
    const creds = await loginStaff("+254713000003", "7423");
    const res = await get("/admin/repeat-attendance?fromDate=2026-06-01&toDate=2026-06-30", creds);
    expect(res.statusCode).toBe(403);
  });

  it("403s an accountant (narrower than read report)", async () => {
    const creds = await loginStaff("+254713000005", "7425");
    const res = await get("/admin/repeat-attendance?fromDate=2026-06-01&toDate=2026-06-30", creds);
    expect(res.statusCode).toBe(403);
  });

  it("allows treasury + super_admin (RBAC)", async () => {
    for (const [phone, pin] of [["+254713000004", "7424"], ["+254713000002", "7422"]] as const) {
      const creds = await loginStaff(phone, pin);
      const res = await get("/admin/repeat-attendance?fromDate=2026-06-01&toDate=2026-06-30", creds);
      expect(res.statusCode).toBe(200);
    }
  });

  it("401s an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/repeat-attendance?fromDate=2026-06-01&toDate=2026-06-30" });
    expect(res.statusCode).toBe(401);
  });
});
