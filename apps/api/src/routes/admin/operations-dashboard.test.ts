import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { attendances, bookings, children, invoices, parents, services, staff, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P3-E05-S01 (Story 27.1) — admin daily-operations dashboard API. Integration via
 * app.inject with real staff sessions (+ CSRF). The dashboard is READ-ONLY and
 * gated to EXACTLY `admin` / `super_admin` / `treasury` (AC4) — deliberately
 * narrower than the `read report` reporting roles (it excludes accountant). The
 * clock is fixed so "today" is deterministic.
 *
 *   GET /admin/operations-dashboard  — the five tile data points (AC1).
 */

const TODAY = "2026-06-15";
let phoneSeq = 0;
const nextPhone = () => `+25471${String(5_000_000 + phoneSeq++).padStart(7, "0")}`;

describe("Admin operations-dashboard API (P3-E05-S01)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const get = (url: string, creds: Creds) =>
    app.inject({ method: "GET", url, headers: { cookie: [creds.session, creds.csrfCookie].join("; ") } });

  async function seedParentChild() {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Pat", lastName: "Doe" }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Kid", dateOfBirth: "2022-01-01" }).returning();
    return { parentId: p!.id, childId: c!.id };
  }

  /** Insert a booking (today) for `serviceId`/`staff`, raising its 1:1 invoice. */
  async function seedBooking(opts: {
    parentId: string;
    childId: string;
    serviceId: string | null;
    staffId: string | null;
    staffName: string;
    revenueCents: number;
    invoiceStatus?: string;
    checkedInAt?: Date;
  }) {
    const [inv] = await dbh.db
      .insert(invoices)
      .values({
        parentId: opts.parentId,
        amountDue: opts.invoiceStatus === "settled" ? 0 : opts.revenueCents,
        status: opts.invoiceStatus ?? "pending",
        serviceId: opts.serviceId,
      })
      .returning();
    const [b] = await dbh.db
      .insert(bookings)
      .values({
        parentId: opts.parentId,
        childId: opts.childId,
        serviceId: opts.serviceId,
        staffId: opts.staffId,
        staffNameSnapshot: opts.staffName,
        staffRateSnapshot: opts.revenueCents,
        invoiceId: inv!.id,
        checkedInAt: opts.checkedInAt ?? new Date(`${TODAY}T10:00:00Z`),
      })
      .returning();
    return b!;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions, now: () => Date.parse(`${TODAY}T15:00:00Z`) });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000004", "7424", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000005", "7425", "accountant"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("returns the five tiles: revenue (total+per-unit), bookings, active, outstanding, top staff (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const [play] = await dbh.db.insert(services).values({ name: "Play hour", unit: "play" }).returning();
    const [salon] = await dbh.db.insert(services).values({ name: "Kids cut", unit: "salon" }).returning();
    const asha = (await dbh.db.insert(staff).values({ displayName: "Asha", role: "stylist" }).returning())[0]!;
    const bree = (await dbh.db.insert(staff).values({ displayName: "Bree", role: "attendant" }).returning())[0]!;
    const fam = await seedParentChild();

    // Two play bookings (Bree) + one salon booking (Asha). One outstanding invoice.
    const pb1 = await seedBooking({ ...fam, serviceId: play!.id, staffId: bree.id, staffName: "Bree", revenueCents: 1000 });
    await seedBooking({ ...fam, serviceId: play!.id, staffId: bree.id, staffName: "Bree", revenueCents: 1500 });
    await seedBooking({ ...fam, serviceId: salon!.id, staffId: asha.id, staffName: "Asha", revenueCents: 5000, invoiceStatus: "outstanding" });
    // One booking from YESTERDAY — must not count toward "today".
    await seedBooking({ ...fam, serviceId: play!.id, staffId: bree.id, staffName: "Bree", revenueCents: 9999, checkedInAt: new Date("2026-06-14T10:00:00Z") });
    // A SETTLED booking today — counts toward revenue/bookings but NOT outstanding.
    await seedBooking({ ...fam, serviceId: play!.id, staffId: bree.id, staffName: "Bree", revenueCents: 0, invoiceStatus: "settled" });

    // One active session (checked in, not checked out / completed); one already checked out.
    await dbh.db.insert(attendances).values({ bookingId: pb1.id, checkedInBy: null });

    const res = await get("/admin/operations-dashboard", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.date).toBe(TODAY);
    expect(body.bookingsCount).toBe(4); // 3 unsettled + 1 settled today; yesterday excluded
    expect(body.revenue.totalCents).toBe(7500);
    const byUnit = Object.fromEntries(body.revenue.byUnit.map((u: { unit: string; revenueCents: number }) => [u.unit, u.revenueCents]));
    expect(byUnit.play).toBe(2500);
    expect(byUnit.salon).toBe(5000);
    expect(byUnit.talent).toBe(0);
    expect(body.activeSessions).toBe(1);
    // Outstanding is centre-wide + date-independent: every non-settled invoice,
    // including yesterday's booking's pending invoice (1000+1500+5000+9999).
    expect(body.outstandingCents).toBe(17_499);
    expect(body.topStaff).toEqual([
      { staffId: asha.id, staffName: "Asha", bookings: 1, revenueCents: 5000 },
      { staffId: bree.id, staffName: "Bree", bookings: 3, revenueCents: 2500 },
    ]);
  });

  it("zero-data day returns zeroed tiles (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await get("/admin/operations-dashboard", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ date: TODAY, bookingsCount: 0, activeSessions: 0, outstandingCents: 0, topStaff: [] });
    expect(body.revenue.totalCents).toBe(0);
    expect(body.revenue.byUnit).toHaveLength(5);
  });

  it("allows admin (AC4)", async () => {
    const res = await get("/admin/operations-dashboard", await loginStaff("+254712000001", "7421"));
    expect(res.statusCode).toBe(200);
  });

  it("allows super_admin (AC4)", async () => {
    const res = await get("/admin/operations-dashboard", await loginStaff("+254712000002", "7422"));
    expect(res.statusCode).toBe(200);
  });

  it("allows treasury (AC4)", async () => {
    const res = await get("/admin/operations-dashboard", await loginStaff("+254712000004", "7424"));
    expect(res.statusCode).toBe(200);
  });

  it("403s accountant — narrower than read-report (AC4)", async () => {
    const res = await get("/admin/operations-dashboard", await loginStaff("+254712000005", "7425"));
    expect(res.statusCode).toBe(403);
  });

  it("403s a non-permitted role (reception) (AC4)", async () => {
    const res = await get("/admin/operations-dashboard", await loginStaff("+254712000003", "7423"));
    expect(res.statusCode).toBe(403);
  });

  it("401s an unauthenticated request (AC4)", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/operations-dashboard" });
    expect(res.statusCode).toBe(401);
  });
});
