import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, invoices, parents, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P3-E05-S04 (Story 27.4) — wallet-aging-report admin API. Integration via
 * app.inject with real staff sessions (+ CSRF). The read endpoint returns the
 * outstanding balances bucketed by age (AC1) with per-parent rows (AC2); the
 * export endpoint returns the same data as text/csv (AC3) and emits the
 * `report.wallet_aging.export` audit event.
 *
 * Gated to the financial-reporting roles — accountant / admin / super_admin /
 * treasury. This is the accountant's AR-aging report (the story is "as
 * accountant"), so unlike 27.1/27.2/27.3 (owner/treasury) accountant IS allowed.
 * reception 403, unauth 401.
 *
 *   GET /admin/wallet-aging[?asOf]          — JSON report (AC1/AC2).
 *   GET /admin/wallet-aging/export[?asOf]   — CSV export (AC3).
 */
describe("Admin wallet-aging API (P3-E05-S04)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let phoneSeq = 0;
  const nextPhone = () => `+25474${String(4_000_000 + phoneSeq++).padStart(7, "0")}`;
  const asOf = "2026-06-02";
  const asOfMs = Date.parse(`${asOf}T12:00:00.000Z`);
  const daysAgo = (n: number) => new Date(asOfMs - n * 86_400_000);

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

  async function seedParent(firstName: string, lastName: string) {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName, lastName }).returning();
    return { parentId: p!.id, userId: u!.id };
  }
  async function seedInvoice(parentId: string, amountDue: number, createdAt: Date, status = "outstanding") {
    await dbh.db.insert(invoices).values({ parentId, amountDue, status, createdAt });
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

  it("returns outstanding balances bucketed by age with per-parent rows (AC1/AC2)", async () => {
    const creds = await loginStaff("+254712000005", "7425"); // accountant
    const a = await seedParent("Ann", "Aye");
    const b = await seedParent("Bea", "Bee");
    await seedInvoice(a.parentId, 1000, daysAgo(3)); // 0–7
    await seedInvoice(a.parentId, 2000, daysAgo(45)); // 31–60
    await seedInvoice(b.parentId, 5000, daysAgo(120)); // 90+
    await seedInvoice(b.parentId, 800, daysAgo(3), "settled"); // excluded

    const res = await get(`/admin/wallet-aging?asOf=${asOf}`, creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const byKey = Object.fromEntries(body.buckets.map((x: { key: string }) => [x.key, x]));
    expect(byKey.d0_7.rows[0]).toMatchObject({ userId: a.userId, parentName: "Ann Aye", amountCents: 1000 });
    expect(byKey.d31_60.rows[0]).toMatchObject({ parentId: a.parentId, amountCents: 2000 });
    expect(byKey.d90_plus.rows[0]).toMatchObject({ userId: b.userId, amountCents: 5000 });
    expect(body.totalCents).toBe(8000);
  });

  it("400s a malformed asOf", async () => {
    const creds = await loginStaff("+254712000005", "7425");
    const res = await get("/admin/wallet-aging?asOf=nope", creds);
    expect(res.statusCode).toBe(400);
  });

  it("exports as text/csv with a Content-Disposition + emits the audit action (AC3)", async () => {
    const creds = await loginStaff("+254712000005", "7425");
    const a = await seedParent("Ann", "Aye");
    await seedInvoice(a.parentId, 2500, daysAgo(3));

    const res = await get(`/admin/wallet-aging/export?asOf=${asOf}`, creds);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain(`wallet_aging_${asOf}.csv`);
    const lines = res.body.split("\r\n");
    expect(lines[0]).toBe("bucket,parent,outstanding_kes");
    expect(res.body).toContain("0–7 days,Ann Aye,25.00");
    expect(res.body).toContain("Total,,25.00");

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "report.wallet_aging.export"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({ as_of: asOf, total_cents: 2500 });
  });

  it("allows accountant / admin / super_admin / treasury (AC1)", async () => {
    const url = `/admin/wallet-aging?asOf=${asOf}`;
    expect((await get(url, await loginStaff("+254712000005", "7425"))).statusCode).toBe(200); // accountant
    expect((await get(url, await loginStaff("+254712000001", "7421"))).statusCode).toBe(200); // admin
    expect((await get(url, await loginStaff("+254712000002", "7422"))).statusCode).toBe(200); // super_admin
    expect((await get(url, await loginStaff("+254712000004", "7424"))).statusCode).toBe(200); // treasury
  });

  it("403s a non-permitted role (reception)", async () => {
    const res = await get(`/admin/wallet-aging?asOf=${asOf}`, await loginStaff("+254712000003", "7423"));
    expect(res.statusCode).toBe(403);
  });

  it("403s the export for a non-permitted role too", async () => {
    const res = await get(`/admin/wallet-aging/export?asOf=${asOf}`, await loginStaff("+254712000003", "7423"));
    expect(res.statusCode).toBe(403);
  });

  it("401s an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/wallet-aging" });
    expect(res.statusCode).toBe(401);
  });
});
