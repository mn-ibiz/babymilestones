import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { floatAccounts, users, wallets, walletLedger } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P5-E05-S04 (Story 35.4) — wallet float vs revenue admin API. Integration via
 * app.inject with real staff sessions (+ CSRF).
 *
 *   GET /admin/float-vs-revenue[?asOf&days]
 *     — today's daily snapshot (customer-wallet liability, segregated balance,
 *       prior-day delta, revenue earned that day — AC1) + the trailing N-day
 *       (90 by default) float-vs-revenue series (AC2). Read-only, not audited.
 *
 * This is the accountant's treasury/finance report ("as accountant…"), so the gate
 * is the financial-reporting set — accountant / admin / super_admin / treasury.
 * reception 403, unauth 401.
 */
describe("Admin float-vs-revenue API (P5-E05-S04)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const asOf = "2026-06-02";
  const at = (day: string, hh = "12") => new Date(`${day}T${hh}:00:00.000Z`);

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

  let walletSeq = 0;
  async function seedWallet(): Promise<string> {
    walletSeq += 1;
    const phone = `+25479${String(1_000_000 + walletSeq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    return w!.id;
  }

  let keySeq = 0;
  async function ledger(
    walletId: string,
    amount: number,
    createdAt: Date,
    floatAccountId?: string,
  ) {
    keySeq += 1;
    await dbh.db.insert(walletLedger).values({
      walletId,
      amount,
      direction: amount >= 0 ? "credit" : "debit",
      kind: amount >= 0 ? "topup" : "debit",
      idempotencyKey: `k${keySeq}`,
      postedBy: "system",
      source: "test",
      createdAt,
      floatAccountId: floatAccountId ?? null,
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

  it("returns the daily snapshot — liability, segregated, prior-day delta (AC1)", async () => {
    const creds = await loginStaff("+254712000005", "7425"); // accountant
    const [bank] = await dbh.db
      .insert(floatAccounts)
      .values({ name: "Bank", kind: "bank", openingBalance: 0, openingDate: "2026-05-25" })
      .returning();
    const w = await seedWallet();
    // Day before: +50_000 (both liability and segregated).
    await ledger(w, 50_000, at("2026-06-01"), bank!.id);
    // Snapshot day: +12_000 more.
    await ledger(w, 12_000, at("2026-06-02"), bank!.id);

    const res = await get(`/admin/float-vs-revenue?asOf=${asOf}&days=2`, creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.snapshot.date).toBe("2026-06-02");
    expect(body.snapshot.walletLiabilityCents).toBe(62_000);
    expect(body.snapshot.segregatedBalanceCents).toBe(62_000);
    expect(body.snapshot.priorDayDeltaCents).toBe(12_000); // 62_000 − 50_000
    expect(body.series).toHaveLength(2);
  });

  it("defaults to a 90-day series (AC2)", async () => {
    const creds = await loginStaff("+254712000005", "7425");
    const res = await get(`/admin/float-vs-revenue?asOf=${asOf}`, creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.series).toHaveLength(90);
    expect(body.series[89].date).toBe("2026-06-02");
  });

  it("honours a custom window length", async () => {
    const creds = await loginStaff("+254712000005", "7425");
    const res = await get(`/admin/float-vs-revenue?asOf=${asOf}&days=7`, creds);
    expect(res.statusCode).toBe(200);
    expect(res.json().series).toHaveLength(7);
  });

  it("400s a malformed asOf", async () => {
    const creds = await loginStaff("+254712000005", "7425");
    const res = await get("/admin/float-vs-revenue?asOf=nope", creds);
    expect(res.statusCode).toBe(400);
  });

  it("400s a window over the cap", async () => {
    const creds = await loginStaff("+254712000005", "7425");
    const res = await get(`/admin/float-vs-revenue?asOf=${asOf}&days=999`, creds);
    expect(res.statusCode).toBe(400);
  });

  it("allows accountant / admin / super_admin / treasury (AC1)", async () => {
    const url = `/admin/float-vs-revenue?asOf=${asOf}&days=2`;
    expect((await get(url, await loginStaff("+254712000005", "7425"))).statusCode).toBe(200); // accountant
    expect((await get(url, await loginStaff("+254712000001", "7421"))).statusCode).toBe(200); // admin
    expect((await get(url, await loginStaff("+254712000002", "7422"))).statusCode).toBe(200); // super_admin
    expect((await get(url, await loginStaff("+254712000004", "7424"))).statusCode).toBe(200); // treasury
  });

  it("403s a non-permitted role (reception)", async () => {
    const res = await get(`/admin/float-vs-revenue?asOf=${asOf}`, await loginStaff("+254712000003", "7423"));
    expect(res.statusCode).toBe(403);
  });

  it("401s an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/float-vs-revenue" });
    expect(res.statusCode).toBe(401);
  });
});
