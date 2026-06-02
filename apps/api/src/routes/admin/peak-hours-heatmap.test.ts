import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { attendances, bookings, children, invoices, parents, services, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P3-E05-S05 (Story 27.5) — peak-hours-heatmap admin API. Integration via
 * app.inject with real staff sessions (+ CSRF). Returns the 7×24 weekday×hour grid
 * of active-session counts over the range (AC1), filterable by unit (AC2), with the
 * range capped at 12 months (AC3). Gated to EXACTLY admin / super_admin / treasury
 * (same posture as 27.1/27.2) — accountant/reception 403, unauth 401.
 *
 *   GET /admin/peak-hours-heatmap?fromDate&toDate&unit  — JSON heatmap (AC1/AC2).
 */
describe("Admin peak-hours-heatmap API (P3-E05-S05)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let phoneSeq = 0;
  const nextPhone = () => `+25470${String(4_000_000 + phoneSeq++).padStart(7, "0")}`;

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

  async function seedSession(opts: { parentId: string; childId: string; serviceId: string; checkedInAt: Date }) {
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
        checkedInAt: opts.checkedInAt,
      })
      .returning();
    await dbh.db.insert(attendances).values({ bookingId: b!.id, checkedInAt: opts.checkedInAt });
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

  it("returns the weekday×hour grid of session counts (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const fam = await seedFamily();
    // Two on Wed (3) 10:00, one on Thu (4) 15:00.
    await seedSession({ ...fam, serviceId: play!.id, checkedInAt: new Date("2026-06-03T10:00:00Z") });
    await seedSession({ ...fam, serviceId: play!.id, checkedInAt: new Date("2026-06-03T10:30:00Z") });
    await seedSession({ ...fam, serviceId: play!.id, checkedInAt: new Date("2026-06-04T15:00:00Z") });

    const res = await get("/admin/peak-hours-heatmap?fromDate=2026-06-01&toDate=2026-06-07", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.from).toBe("2026-06-01");
    expect(body.to).toBe("2026-06-07");
    expect(body.cells).toHaveLength(7);
    expect(body.cells[3][10]).toBe(2);
    expect(body.cells[4][15]).toBe(1);
    expect(body.totalSessions).toBe(3);
    expect(body.peak).toEqual({ weekday: 3, hour: 10, count: 2 });
  });

  it("filters by unit (AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const [salon] = await dbh.db.insert(services).values({ name: "Cut", unit: "salon" }).returning();
    const fam = await seedFamily();
    await seedSession({ ...fam, serviceId: play!.id, checkedInAt: new Date("2026-06-03T10:00:00Z") });
    await seedSession({ ...fam, serviceId: salon!.id, checkedInAt: new Date("2026-06-03T10:00:00Z") });

    const res = await get("/admin/peak-hours-heatmap?fromDate=2026-06-01&toDate=2026-06-07&unit=salon", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.unit).toBe("salon");
    expect(body.cells[3][10]).toBe(1);
    expect(body.totalSessions).toBe(1);
  });

  it("400s an invalid (out-of-order) date range", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await get("/admin/peak-hours-heatmap?fromDate=2026-06-14&toDate=2026-06-08", creds);
    expect(res.statusCode).toBe(400);
  });

  it("400s a range longer than 12 months (AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await get("/admin/peak-hours-heatmap?fromDate=2025-06-01&toDate=2026-06-02", creds);
    expect(res.statusCode).toBe(400);
  });

  it("400s an unknown unit (AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await get("/admin/peak-hours-heatmap?fromDate=2026-06-01&toDate=2026-06-07&unit=spaceship", creds);
    expect(res.statusCode).toBe(400);
  });

  it("allows admin / super_admin / treasury (AC1)", async () => {
    const url = "/admin/peak-hours-heatmap?fromDate=2026-06-01&toDate=2026-06-07";
    expect((await get(url, await loginStaff("+254712000001", "7421"))).statusCode).toBe(200);
    expect((await get(url, await loginStaff("+254712000002", "7422"))).statusCode).toBe(200);
    expect((await get(url, await loginStaff("+254712000004", "7424"))).statusCode).toBe(200);
  });

  it("403s accountant — narrower than read-report", async () => {
    const res = await get("/admin/peak-hours-heatmap?fromDate=2026-06-01&toDate=2026-06-07", await loginStaff("+254712000005", "7425"));
    expect(res.statusCode).toBe(403);
  });

  it("403s a non-permitted role (reception)", async () => {
    const res = await get("/admin/peak-hours-heatmap?fromDate=2026-06-01&toDate=2026-06-07", await loginStaff("+254712000003", "7423"));
    expect(res.statusCode).toBe(403);
  });

  it("401s an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/peak-hours-heatmap?fromDate=2026-06-01&toDate=2026-06-07" });
    expect(res.statusCode).toBe(401);
  });
});
