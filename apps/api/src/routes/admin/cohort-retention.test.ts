import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { parents, users, wallets, walletLedger } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * Story 35.2 — cohort-retention admin API. Integration via app.inject with real
 * staff sessions (+ CSRF). The read endpoint returns the retention matrix for the
 * selected signup-month range (AC1): rows = signup month, columns = months-since-
 * signup, cells = % of the cohort with a paid touchpoint (wallet debit) in that
 * offset month (AC2).
 *
 * Gated to the owner/treasury reporting roles — admin / super_admin / treasury,
 * matching the rest of the operations dashboard surfaces (27.1/27.2). reception 403,
 * unauthenticated 401.
 *
 *   GET /admin/cohort-retention?fromMonth&toMonth[&activeDefinition]
 */
describe("Admin cohort-retention API (Story 35.2)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let phoneSeq = 0;
  let keySeq = 0;
  const nextPhone = () => `+25473${String(5_000_000 + phoneSeq++).padStart(7, "0")}`;
  const nextKey = () => `cr-api:${keySeq++}`;
  // Pin "now" so asOfMonth is deterministic (offsets observable through 2026-03).
  const now = () => Date.parse("2026-03-15T12:00:00.000Z");

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

  const at = (month: string, day = 15) => new Date(`${month}-${String(day).padStart(2, "0")}T12:00:00.000Z`);

  async function seedParent(signup: Date) {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "P", lastName: "Test", createdAt: signup })
      .returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    return { parentId: p!.id, walletId: w!.id };
  }
  async function seedDebit(walletId: string, createdAt: Date) {
    await dbh.db.insert(walletLedger).values({
      walletId,
      amount: -1000,
      direction: "debit",
      kind: "debit",
      idempotencyKey: nextKey(),
      postedBy: "system",
      source: "checkin",
      createdAt,
    });
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions, now });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000004", "7424", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("returns the retention matrix for the signup-month range (AC1/AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421"); // admin
    // Jan cohort of 2: a active Jan+Mar, b active Jan only.
    const a = await seedParent(at("2026-01"));
    const b = await seedParent(at("2026-01"));
    await seedDebit(a.walletId, at("2026-01"));
    await seedDebit(a.walletId, at("2026-03"));
    await seedDebit(b.walletId, at("2026-01"));

    const res = await get("/admin/cohort-retention?fromMonth=2026-01&toMonth=2026-01", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cohorts).toHaveLength(1);
    const c = body.cohorts[0];
    expect(c.signupMonth).toBe("2026-01");
    expect(c.cohortSize).toBe(2);
    const byOffset = Object.fromEntries(c.cells.map((x: { offset: number }) => [x.offset, x]));
    expect(byOffset[0]).toMatchObject({ retained: 2, percentage: 100 }); // Jan: both
    expect(byOffset[1]).toMatchObject({ retained: 0, percentage: 0 }); // Feb: neither
    expect(byOffset[2]).toMatchObject({ retained: 1, percentage: 50 }); // Mar: a only
  });

  it("filters cohorts by the requested month range (date filter)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const early = await seedParent(at("2026-01"));
    const inRange = await seedParent(at("2026-02"));
    await seedDebit(early.walletId, at("2026-01"));
    await seedDebit(inRange.walletId, at("2026-02"));

    const res = await get("/admin/cohort-retention?fromMonth=2026-02&toMonth=2026-02", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cohorts.map((c: { signupMonth: string }) => c.signupMonth)).toEqual(["2026-02"]);
  });

  it("400s a malformed / out-of-order month range", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    expect((await get("/admin/cohort-retention?fromMonth=2026-13&toMonth=2026-03", creds)).statusCode).toBe(400);
    expect((await get("/admin/cohort-retention?fromMonth=2026-03&toMonth=2026-01", creds)).statusCode).toBe(400);
  });

  it("allows admin / super_admin / treasury (AC1)", async () => {
    const url = "/admin/cohort-retention?fromMonth=2026-01&toMonth=2026-03";
    expect((await get(url, await loginStaff("+254712000001", "7421"))).statusCode).toBe(200); // admin
    expect((await get(url, await loginStaff("+254712000002", "7422"))).statusCode).toBe(200); // super_admin
    expect((await get(url, await loginStaff("+254712000004", "7424"))).statusCode).toBe(200); // treasury
  });

  it("403s a non-permitted role (reception)", async () => {
    const res = await get("/admin/cohort-retention?fromMonth=2026-01&toMonth=2026-03", await loginStaff("+254712000003", "7423"));
    expect(res.statusCode).toBe(403);
  });

  it("401s an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/cohort-retention?fromMonth=2026-01&toMonth=2026-03" });
    expect(res.statusCode).toBe(401);
  });
});
