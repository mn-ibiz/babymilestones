import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import {
  bookings,
  children,
  commissionLedger,
  invoices,
  parents,
  services,
  staff,
  users,
} from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P3-E05-S03 (Story 27.3) — top-staff-leaderboard admin API. Integration via
 * app.inject with real staff sessions (+ CSRF). The leaderboard endpoint returns
 * per-staff revenue / service count / average ticket over the range (AC1),
 * filterable by role (AC2); the per-staff drill-down returns that staff member's
 * commission totals over the same range (AC3). Gated to EXACTLY admin /
 * super_admin / treasury (same posture as 27.1/27.2) — accountant/reception 403,
 * unauth 401, bad range 400.
 *
 *   GET /admin/staff-leaderboard?fromDate&toDate&role            — leaderboard (AC1/AC2).
 *   GET /admin/staff-leaderboard/:staffId/commission?fromDate&toDate — drill-down (AC3).
 */
describe("Admin staff-leaderboard API (P3-E05-S03)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let phoneSeq = 0;
  const nextPhone = () => `+25476${String(4_000_000 + phoneSeq++).padStart(7, "0")}`;

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

  async function seedBooking(opts: {
    parentId: string;
    childId: string;
    serviceId: string;
    staffId: string;
    revenueCents: number;
    checkedInAt: Date;
  }) {
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId: opts.parentId, amountDue: opts.revenueCents, serviceId: opts.serviceId })
      .returning();
    const [b] = await dbh.db
      .insert(bookings)
      .values({
        parentId: opts.parentId,
        childId: opts.childId,
        serviceId: opts.serviceId,
        staffId: opts.staffId,
        staffNameSnapshot: "Snapshot",
        staffRateSnapshot: opts.revenueCents,
        invoiceId: inv!.id,
        checkedInAt: opts.checkedInAt,
      })
      .returning();
    return { bookingId: b!.id };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
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

  it("returns per-staff revenue / service count / average ticket over the range (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const [asha] = await dbh.db.insert(staff).values({ displayName: "Asha", role: "stylist" }).returning();
    const [svc] = await dbh.db.insert(services).values({ name: "Cut", unit: "salon" }).returning();
    const fam = await seedFamily();
    await seedBooking({ ...fam, serviceId: svc!.id, staffId: asha!.id, revenueCents: 3000, checkedInAt: new Date("2026-06-10T10:00:00Z") });
    await seedBooking({ ...fam, serviceId: svc!.id, staffId: asha!.id, revenueCents: 1000, checkedInAt: new Date("2026-06-11T10:00:00Z") });

    const res = await get("/admin/staff-leaderboard?fromDate=2026-06-08&toDate=2026-06-14", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.from).toBe("2026-06-08");
    expect(body.to).toBe("2026-06-14");
    const row = body.rows.find((r: { staffId: string }) => r.staffId === asha!.id);
    expect(row.revenueCents).toBe(4000);
    expect(row.serviceCount).toBe(2);
    expect(row.avgTicketCents).toBe(2000);
  });

  it("filters the leaderboard by role (AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const [stylist] = await dbh.db.insert(staff).values({ displayName: "Stella", role: "stylist" }).returning();
    await dbh.db.insert(staff).values({ displayName: "Ivan", role: "instructor" }).returning();

    const res = await get("/admin/staff-leaderboard?fromDate=2026-06-08&toDate=2026-06-14&role=stylist", creds);
    expect(res.statusCode).toBe(200);
    const names = res.json().rows.map((r: { staffName: string }) => r.staffName);
    expect(names).toEqual(["Stella"]);
    expect(res.json().rows[0].staffId).toBe(stylist!.id);
  });

  it("returns the per-staff commission drill-down over the same range (AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const [asha] = await dbh.db.insert(staff).values({ displayName: "Asha", role: "stylist" }).returning();
    const [svc] = await dbh.db.insert(services).values({ name: "Cut", unit: "salon" }).returning();
    const fam = await seedFamily();
    const b = await seedBooking({ ...fam, serviceId: svc!.id, staffId: asha!.id, revenueCents: 3000, checkedInAt: new Date("2026-06-10T10:00:00Z") });
    await dbh.db.insert(commissionLedger).values({
      staffId: asha!.id,
      bookingId: b.bookingId,
      amountCents: 1800,
      rateSnapshot: "10.00",
      source: "booking",
      occurredAt: new Date("2026-06-10T10:00:00Z"),
    });

    const res = await get(`/admin/staff-leaderboard/${asha!.id}/commission?fromDate=2026-06-08&toDate=2026-06-14`, creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.staffName).toBe("Asha");
    expect(body.totals.netCents).toBe(1800);
    expect(body.totals.accruedCents).toBe(1800);
  });

  it("404s the drill-down for an unknown staff id", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await get("/admin/staff-leaderboard/00000000-0000-0000-0000-000000000000/commission?fromDate=2026-06-08&toDate=2026-06-14", creds);
    expect(res.statusCode).toBe(404);
  });

  it("400s an invalid date range (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await get("/admin/staff-leaderboard?fromDate=2026-06-14&toDate=2026-06-08", creds);
    expect(res.statusCode).toBe(400);
  });

  it("400s an unknown role filter (AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await get("/admin/staff-leaderboard?fromDate=2026-06-08&toDate=2026-06-14&role=ceo", creds);
    expect(res.statusCode).toBe(400);
  });

  it("allows admin / super_admin / treasury (AC1)", async () => {
    const url = "/admin/staff-leaderboard?fromDate=2026-06-01&toDate=2026-06-07";
    expect((await get(url, await loginStaff("+254712000001", "7421"))).statusCode).toBe(200);
    expect((await get(url, await loginStaff("+254712000002", "7422"))).statusCode).toBe(200);
    expect((await get(url, await loginStaff("+254712000004", "7424"))).statusCode).toBe(200);
  });

  it("403s accountant — narrower than read-report", async () => {
    const res = await get("/admin/staff-leaderboard?fromDate=2026-06-01&toDate=2026-06-07", await loginStaff("+254712000005", "7425"));
    expect(res.statusCode).toBe(403);
  });

  it("403s a non-permitted role (reception), incl. the drill-down", async () => {
    const creds = await loginStaff("+254712000003", "7423");
    expect((await get("/admin/staff-leaderboard?fromDate=2026-06-01&toDate=2026-06-07", creds)).statusCode).toBe(403);
    expect((await get("/admin/staff-leaderboard/x/commission?fromDate=2026-06-01&toDate=2026-06-07", creds)).statusCode).toBe(403);
  });

  it("401s an unauthenticated request (both endpoints)", async () => {
    expect((await app.inject({ method: "GET", url: "/admin/staff-leaderboard?fromDate=2026-06-01&toDate=2026-06-07" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/admin/staff-leaderboard/x/commission?fromDate=2026-06-01&toDate=2026-06-07" })).statusCode).toBe(401);
  });
});
