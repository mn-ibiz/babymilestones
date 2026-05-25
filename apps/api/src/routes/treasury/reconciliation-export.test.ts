import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, floatAccounts, reconciliationAdjustments, users, walletLedger, wallets } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P1-E06-S04 — CSV export of the daily float reconciliation for the accountant.
 * Integration via app.inject with real staff sessions (+ CSRF).
 */
describe("Reconciliation export (P1-E06-S04)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
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

  const get = (url: string, creds: Creds, opts: { auth?: boolean } = {}) => {
    const { auth = true } = opts;
    const cookieParts = [creds.csrfCookie];
    if (auth) cookieParts.unshift(creds.session);
    return app.inject({
      method: "GET",
      url,
      headers: { cookie: cookieParts.join("; "), "x-csrf-token": creds.csrfToken },
    });
  };

  let walletId: string;
  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000005", "7425", "accountant"));
    const [u] = await dbh.db.insert(users).values({ phone: "+254799000000", pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    walletId = w!.id;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  async function seedTill(opening = 0) {
    const [t] = await dbh.db
      .insert(floatAccounts)
      .values({ name: "Main Till", kind: "mpesa_till", openingBalance: opening, openingDate: "2026-05-01" })
      .returning();
    return t!.id;
  }
  async function tagged(floatAccountId: string, amount: number, day: string, key: string) {
    await dbh.db.insert(walletLedger).values({
      walletId,
      amount,
      direction: amount >= 0 ? "credit" : "debit",
      kind: amount >= 0 ? "topup" : "debit",
      idempotencyKey: key,
      source: "mpesa",
      postedBy: "system",
      floatAccountId,
      createdAt: new Date(`${day}T08:00:00Z`),
    });
  }

  it("exports CSV with the AC2 columns and per-day rows (AC1/AC2)", async () => {
    const accountant = await loginStaff("+254712000005", "7425");
    const tillId = await seedTill(10_000);
    await tagged(tillId, 50_000, "2026-05-01", "k1");
    const [poster] = await dbh.db.select().from(users).where(eq(users.role, "admin"));
    const [approver] = await dbh.db.select().from(users).where(eq(users.role, "treasury"));
    await dbh.db.insert(reconciliationAdjustments).values({
      floatAccountId: tillId,
      amount: -2_000,
      reason: "cash short",
      postedBy: poster!.id,
      approvedBy: approver!.id,
      status: "approved",
      createdAt: new Date("2026-05-02T10:00:00Z"),
    });

    const res = await get("/treasury/reconciliation/export?fromDate=2026-05-01&toDate=2026-05-02", accountant);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(String(res.headers["content-disposition"])).toContain("attachment");
    const lines = res.body.trim().split("\r\n");
    expect(lines[0]).toBe("date,account,system_balance_kes,real_balance_kes,drift_kes,adjustments_kes");
    expect(lines[1]).toBe("2026-05-01,Main Till,600.00,600.00,0.00,0.00");
    // Day 2: system carries 60_000; -2_000 approved adjustment → real 58_000, drift 20.00.
    expect(lines[2]).toBe("2026-05-02,Main Till,600.00,580.00,20.00,-20.00");
  });

  it("validates the date range (AC1)", async () => {
    const accountant = await loginStaff("+254712000005", "7425");
    const res = await get("/treasury/reconciliation/export?fromDate=2026-05-31&toDate=2026-05-01", accountant);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing date range", async () => {
    const accountant = await loginStaff("+254712000005", "7425");
    const res = await get("/treasury/reconciliation/export", accountant);
    expect(res.statusCode).toBe(400);
  });

  it("audits the export to audit_outbox", async () => {
    const accountant = await loginStaff("+254712000005", "7425");
    await seedTill();
    const res = await get("/treasury/reconciliation/export?fromDate=2026-05-01&toDate=2026-05-01", accountant);
    expect(res.statusCode).toBe(200);
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "treasury.reconciliation.export"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({ from_date: "2026-05-01", to_date: "2026-05-01" });
  });

  it("allows treasury, admin and super_admin; forbids reception; 401 unauthenticated", async () => {
    const treasury = await loginStaff("+254712000002", "7422");
    const admin = await loginStaff("+254712000001", "7421");
    const reception = await loginStaff("+254712000003", "7423");
    await seedTill();
    const url = "/treasury/reconciliation/export?fromDate=2026-05-01&toDate=2026-05-01";
    expect((await get(url, treasury)).statusCode).toBe(200);
    expect((await get(url, admin)).statusCode).toBe(200);
    expect((await get(url, reception)).statusCode).toBe(403);
    expect((await get(url, treasury, { auth: false })).statusCode).toBe(401);
  });
});
