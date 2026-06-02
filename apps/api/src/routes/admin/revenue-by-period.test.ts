import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, bookings, children, invoices, parents, services, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P3-E05-S02 (Story 27.2) — revenue-by-unit-by-period admin API. Integration via
 * app.inject with real staff sessions (+ CSRF). Read endpoint returns the per-unit
 * net series + delta (AC1); the export endpoint returns the same data as text/csv
 * under the same date-range filter (AC2) and emits the `report.revenue.export`
 * audit event. Gated to EXACTLY admin / super_admin / treasury (same posture as
 * 27.1) — accountant/reception 403, unauth 401.
 *
 *   GET /admin/revenue-by-period?fromDate&toDate          — JSON report (AC1).
 *   GET /admin/revenue-by-period/export?fromDate&toDate   — CSV export (AC2/AC3).
 */
describe("Admin revenue-by-period API (P3-E05-S02)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let phoneSeq = 0;
  const nextPhone = () => `+25473${String(2_000_000 + phoneSeq++).padStart(7, "0")}`;

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
    revenueCents: number;
    checkedInAt: Date;
  }) {
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId: opts.parentId, amountDue: opts.revenueCents, serviceId: opts.serviceId })
      .returning();
    await dbh.db.insert(bookings).values({
      parentId: opts.parentId,
      childId: opts.childId,
      serviceId: opts.serviceId,
      staffNameSnapshot: "Staff",
      staffRateSnapshot: opts.revenueCents,
      invoiceId: inv!.id,
      checkedInAt: opts.checkedInAt,
    });
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

  it("returns the per-unit net series + period-over-period delta (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const [salon] = await dbh.db.insert(services).values({ name: "Cut", unit: "salon" }).returning();
    const fam = await seedFamily();
    // Current period 06-08..06-14.
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 3000, checkedInAt: new Date("2026-06-10T10:00:00Z") });
    await seedBooking({ ...fam, serviceId: salon!.id, revenueCents: 5000, checkedInAt: new Date("2026-06-11T10:00:00Z") });
    // Previous period 06-01..06-07.
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 1000, checkedInAt: new Date("2026-06-03T10:00:00Z") });

    const res = await get("/admin/revenue-by-period?fromDate=2026-06-08&toDate=2026-06-14", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.from).toBe("2026-06-08");
    expect(body.to).toBe("2026-06-14");
    const byUnit = Object.fromEntries(body.byUnit.map((u: { unit: string; revenueCents: number }) => [u.unit, u.revenueCents]));
    expect(byUnit.play).toBe(3000);
    expect(byUnit.salon).toBe(5000);
    expect(byUnit.talent).toBe(0);
    expect(body.totalCents).toBe(8000);
    expect(body.previousTotalCents).toBe(1000);
    expect(body.totalDeltaCents).toBe(7000);
    const deltaByUnit = Object.fromEntries(body.deltaByUnit.map((u: { unit: string; deltaCents: number }) => [u.unit, u.deltaCents]));
    expect(deltaByUnit.play).toBe(2000); // 3000 − 1000
    expect(deltaByUnit.salon).toBe(5000); // 5000 − 0
  });

  it("400s an invalid date range", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await get("/admin/revenue-by-period?fromDate=2026-06-14&toDate=2026-06-08", creds);
    expect(res.statusCode).toBe(400);
  });

  it("exports the same filter as text/csv with a Content-Disposition + emits the audit action (AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const fam = await seedFamily();
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 2500, checkedInAt: new Date("2026-06-10T10:00:00Z") });

    const res = await get("/admin/revenue-by-period/export?fromDate=2026-06-08&toDate=2026-06-14", creds);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("revenue_by_unit_2026-06-08_to_2026-06-14.csv");
    const body = res.body;
    expect(body.split("\r\n")[0]).toBe("unit,revenue_kes,previous_revenue_kes,delta_kes");
    expect(body).toContain("Play,25.00,");
    expect(body).toContain("Total,25.00,");

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "report.revenue.export"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({ from_date: "2026-06-08", to_date: "2026-06-14" });
  });

  it("allows admin / super_admin / treasury (AC1)", async () => {
    const url = "/admin/revenue-by-period?fromDate=2026-06-01&toDate=2026-06-07";
    expect((await get(url, await loginStaff("+254712000001", "7421"))).statusCode).toBe(200);
    expect((await get(url, await loginStaff("+254712000002", "7422"))).statusCode).toBe(200);
    expect((await get(url, await loginStaff("+254712000004", "7424"))).statusCode).toBe(200);
  });

  it("403s accountant — narrower than read-report", async () => {
    const res = await get("/admin/revenue-by-period?fromDate=2026-06-01&toDate=2026-06-07", await loginStaff("+254712000005", "7425"));
    expect(res.statusCode).toBe(403);
  });

  it("403s a non-permitted role (reception)", async () => {
    const res = await get("/admin/revenue-by-period?fromDate=2026-06-01&toDate=2026-06-07", await loginStaff("+254712000003", "7423"));
    expect(res.statusCode).toBe(403);
  });

  it("403s the export for a non-permitted role too", async () => {
    const res = await get("/admin/revenue-by-period/export?fromDate=2026-06-01&toDate=2026-06-07", await loginStaff("+254712000003", "7423"));
    expect(res.statusCode).toBe(403);
  });

  it("401s an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/revenue-by-period?fromDate=2026-06-01&toDate=2026-06-07" });
    expect(res.statusCode).toBe(401);
  });
});
