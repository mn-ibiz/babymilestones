import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import {
  auditOutbox,
  bookings,
  children,
  expenses,
  invoices,
  parents,
  services,
  users,
} from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P6-E05-S01 (Story 35.1) — consolidated-P&L admin API. Integration via app.inject
 * with real staff sessions (+ CSRF). The read endpoint returns the per-unit P&L +
 * MoM/YoY comparison (AC1/AC2); the export endpoints return CSV ("Excel") and
 * printable HTML ("PDF") under the same filter (AC3) and emit `report.pnl.export`.
 * P&L is sensitive — gated to the finance/report roles that own the books
 * (accountant / admin / super_admin / treasury); reception 403, unauth 401.
 *
 *   GET /admin/pnl-report?anchor&granularity            — JSON report (AC1/AC2).
 *   GET /admin/pnl-report/export.csv?anchor&granularity — CSV ("Excel") (AC3).
 *   GET /admin/pnl-report/export.pdf?anchor&granularity — printable HTML (AC3).
 */
describe("Admin P&L report API (P6-E05-S01)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let phoneSeq = 0;
  const nextPhone = () => `+25474${String(3_000_000 + phoneSeq++).padStart(7, "0")}`;

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

  async function seedExpense(opts: { expenseDate: string; businessUnit: string | null; amountCents: number; actor: string }) {
    await dbh.db.insert(expenses).values({
      expenseDate: opts.expenseDate,
      category: "Rent",
      businessUnit: opts.businessUnit,
      amountCents: opts.amountCents,
      paymentMethod: "cash",
      createdBy: opts.actor,
    });
  }

  let adminId: string;

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    const [admin] = await dbh.db.insert(users).values(await staffUserSeed("+254713000001", "7421", "admin")).returning();
    adminId = admin!.id;
    await dbh.db.insert(users).values(await staffUserSeed("+254713000002", "7422", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254713000004", "7424", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254713000005", "7425", "accountant"));
    await dbh.db.insert(users).values(await staffUserSeed("+254713000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("returns the per-unit P&L + MoM comparison (AC1/AC2)", async () => {
    const creds = await loginStaff("+254713000001", "7421");
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const fam = await seedFamily();
    // May (current): revenue 100.00, play expense 30.00, shop expense 5.00, overhead 10.00
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 100_00, checkedInAt: new Date("2026-05-10T10:00:00Z") });
    await seedExpense({ expenseDate: "2026-05-03", businessUnit: "play", amountCents: 30_00, actor: adminId });
    await seedExpense({ expenseDate: "2026-05-04", businessUnit: "shop", amountCents: 5_00, actor: adminId });
    await seedExpense({ expenseDate: "2026-05-05", businessUnit: null, amountCents: 10_00, actor: adminId });
    // April (prior): revenue 60.00
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 60_00, checkedInAt: new Date("2026-04-10T10:00:00Z") });

    const res = await get("/admin/pnl-report?anchor=2026-05-17&granularity=month", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.granularity).toBe("month");
    expect(body.current.from).toBe("2026-05-01");
    expect(body.current.to).toBe("2026-06-01");

    const play_ = body.current.byUnit.find((u: { unit: string }) => u.unit === "play");
    expect(play_.revenueCents).toBe(100_00);
    expect(play_.directCostsCents).toBe(0);
    expect(play_.expensesCents).toBe(30_00);
    expect(play_.netCents).toBe(70_00);

    expect(body.current.totals.revenueCents).toBe(150_00 - 50_00); // only play revenue (100.00)
    expect(body.current.totals.sharedOverheadCents).toBe(10_00);
    expect(body.current.totals.netCents).toBe(100_00 - 30_00 - 5_00 - 10_00);

    expect(body.previous.totals.revenueCents).toBe(60_00);
    expect(body.totalsDelta.revenueDeltaCents).toBe(40_00);
  });

  it("supports a YoY comparison (AC2)", async () => {
    const creds = await loginStaff("+254713000001", "7421");
    const res = await get("/admin/pnl-report?anchor=2026-05-17&granularity=year", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.current.from).toBe("2026-01-01");
    expect(body.current.to).toBe("2027-01-01");
    expect(body.previous.from).toBe("2025-01-01");
  });

  it("400s a malformed anchor", async () => {
    const creds = await loginStaff("+254713000001", "7421");
    const res = await get("/admin/pnl-report?anchor=2026/05/17&granularity=month", creds);
    expect(res.statusCode).toBe(400);
  });

  it("exports CSV ('Excel') with a Content-Disposition + emits report.pnl.export (AC3)", async () => {
    const creds = await loginStaff("+254713000001", "7421");
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const fam = await seedFamily();
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 25_00, checkedInAt: new Date("2026-05-10T10:00:00Z") });

    const res = await get("/admin/pnl-report/export.csv?anchor=2026-05-17&granularity=month", creds);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("pnl_2026-05-01_month.csv");
    expect(res.body.split("\r\n")[0]).toBe("unit,revenue_kes,direct_costs_kes,expenses_kes,net_kes,previous_net_kes,net_delta_kes");
    expect(res.body).toContain("Play,25.00,");
    expect(res.body).toContain("Consolidated net");

    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "report.pnl.export"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({ anchor: "2026-05-17", granularity: "month", format: "csv" });
  });

  it("exports printable HTML ('PDF') with a Content-Disposition + emits report.pnl.export (AC3)", async () => {
    const creds = await loginStaff("+254713000001", "7421");
    const res = await get("/admin/pnl-report/export.pdf?anchor=2026-05-17&granularity=month", creds);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["content-disposition"]).toContain("pnl_2026-05-01_month.html");
    expect(res.body).toContain("<!DOCTYPE html>");
    expect(res.body).toContain("Consolidated P&amp;L");

    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "report.pnl.export"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({ format: "pdf" });
  });

  it("allows the finance/report roles incl. accountant (AC — RBAC)", async () => {
    const url = "/admin/pnl-report?anchor=2026-05-17&granularity=month";
    expect((await get(url, await loginStaff("+254713000001", "7421"))).statusCode).toBe(200); // admin
    expect((await get(url, await loginStaff("+254713000002", "7422"))).statusCode).toBe(200); // super_admin
    expect((await get(url, await loginStaff("+254713000004", "7424"))).statusCode).toBe(200); // treasury
    expect((await get(url, await loginStaff("+254713000005", "7425"))).statusCode).toBe(200); // accountant
  });

  it("403s reception (not a finance role)", async () => {
    const res = await get("/admin/pnl-report?anchor=2026-05-17&granularity=month", await loginStaff("+254713000003", "7423"));
    expect(res.statusCode).toBe(403);
  });

  it("403s the export for reception too", async () => {
    const res = await get("/admin/pnl-report/export.csv?anchor=2026-05-17&granularity=month", await loginStaff("+254713000003", "7423"));
    expect(res.statusCode).toBe(403);
  });

  it("401s an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/pnl-report?anchor=2026-05-17&granularity=month" });
    expect(res.statusCode).toBe(401);
  });
});
