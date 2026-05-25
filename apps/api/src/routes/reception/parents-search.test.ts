import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { invoices, parents, users, wallets, walletLedger } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { PARENT_SEARCH_LIMIT, type ParentSearchResponse } from "@bm/contracts";
import { buildApp } from "../../app.js";

/**
 * P1-E05-S01 — Reception parent search. Integration via app.inject with real
 * staff sessions. Covers find-by-phone (any format, AC1), find-by-name substring
 * (AC1), no-match, result shaping (name/phone-last4/balance/outstanding/last
 * visit — AC3), the staff-only role guard, and the perf budget against a 10k
 * fixture (AC2).
 */
describe("Reception parent search (P1-E05-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/staff/login",
      payload: { phone, pin },
    });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    return { session };
  };

  let seq = 0;
  async function seedParent(opts: {
    first: string;
    last: string;
    phone?: string;
  }): Promise<{ userId: string; parentId: string; walletId: string; phone: string }> {
    seq += 1;
    const phone = opts.phone ?? `+25473${String(1000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: opts.first, lastName: opts.last })
      .returning();
    return { userId: u!.id, parentId: p!.id, walletId: w!.id, phone };
  }

  const search = (q: string, creds: { session: string }, opts: { auth?: boolean } = {}) => {
    const { auth = true } = opts;
    return app.inject({
      method: "GET",
      url: `/reception/parents/search?q=${encodeURIComponent(q)}`,
      headers: auth ? { cookie: creds.session } : {},
    });
  };

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "reception"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "packer"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("finds a parent by phone in any format → exact + prefix (AC1)", async () => {
    await seedParent({ first: "Asha", last: "Mwangi", phone: "+254712345678" });
    const recep = await loginStaff("0712000001", "7421");

    for (const q of ["+254712345678", "0712345678", "0712"]) {
      const res = await search(q, recep);
      expect(res.statusCode).toBe(200);
      const body = res.json() as ParentSearchResponse;
      expect(body.results.map((r) => r.firstName)).toContain("Asha");
    }
  });

  it("finds a parent by partial name substring, case-insensitive (AC1)", async () => {
    await seedParent({ first: "Benjamin", last: "Otieno", phone: "+254722000111" });
    const recep = await loginStaff("0712000001", "7421");

    const byFirst = (await search("benj", recep)).json() as ParentSearchResponse;
    expect(byFirst.results.map((r) => r.lastName)).toContain("Otieno");
    const byLast = (await search("TIEN", recep)).json() as ParentSearchResponse;
    expect(byLast.results.map((r) => r.firstName)).toContain("Benjamin");
  });

  it("returns no results for a non-matching query", async () => {
    await seedParent({ first: "Carol", last: "Kim", phone: "+254733000222" });
    const recep = await loginStaff("0712000001", "7421");
    const res = await search("zzzznoonehere", recep);
    expect(res.statusCode).toBe(200);
    expect((res.json() as ParentSearchResponse).results).toHaveLength(0);
  });

  it("shapes each result: name, phone last-4, balance, outstanding, last visit (AC3)", async () => {
    const p = await seedParent({ first: "Diana", last: "Wafula", phone: "+254744123456" });
    // A top-up credit and a check-in debit (the latter is the 'last visit').
    await dbh.db.insert(walletLedger).values({
      walletId: p.walletId,
      amount: 50_000,
      direction: "credit",
      kind: "topup",
      idempotencyKey: "k-credit",
      postedBy: "system",
      source: "cash:reception",
    });
    await dbh.db.insert(walletLedger).values({
      walletId: p.walletId,
      amount: -20_000,
      direction: "debit",
      kind: "debit",
      idempotencyKey: "k-debit",
      postedBy: "system",
      source: "checkin",
    });
    // An outstanding (unsettled) invoice.
    await dbh.db
      .insert(invoices)
      .values({ parentId: p.parentId, amountDue: 7_500, status: "outstanding" });

    const recep = await loginStaff("0712000001", "7421");
    const body = (await search("Diana", recep)).json() as ParentSearchResponse;
    const row = body.results.find((r) => r.userId === p.userId)!;
    expect(row.firstName).toBe("Diana");
    expect(row.lastName).toBe("Wafula");
    expect(row.phoneLast4).toBe("3456");
    expect(row.walletBalanceCents).toBe(30_000);
    expect(row.outstandingCents).toBe(7_500);
    expect(row.lastVisitAt).not.toBeNull();
  });

  it("a settled invoice does not count toward outstanding", async () => {
    const p = await seedParent({ first: "Esther", last: "Njoroge" });
    await dbh.db
      .insert(invoices)
      .values({ parentId: p.parentId, amountDue: 0, status: "settled" });
    const recep = await loginStaff("0712000001", "7421");
    const body = (await search("Esther", recep)).json() as ParentSearchResponse;
    expect(body.results.find((r) => r.userId === p.userId)!.outstandingCents).toBe(0);
  });

  it("never-visited parent → lastVisitAt null, zero balance", async () => {
    const p = await seedParent({ first: "Faith", last: "Achieng" });
    const recep = await loginStaff("0712000001", "7421");
    const row = ((await search("Faith", recep)).json() as ParentSearchResponse).results.find(
      (r) => r.userId === p.userId,
    )!;
    expect(row.lastVisitAt).toBeNull();
    expect(row.walletBalanceCents).toBe(0);
  });

  it("packer (no read wallet) is rejected → 403 (staff-only)", async () => {
    await seedParent({ first: "Grace", last: "Mutua" });
    const packer = await loginStaff("0712000003", "7423");
    expect((await search("Grace", packer)).statusCode).toBe(403);
  });

  it("unauthenticated request → 401", async () => {
    const recep = await loginStaff("0712000001", "7421");
    expect((await search("anything", recep, { auth: false })).statusCode).toBe(401);
  });

  it("blank / too-short query → 400 or empty", async () => {
    const recep = await loginStaff("0712000001", "7421");
    expect((await search("", recep)).statusCode).toBe(400);
    // A single char is below the min → empty results, not an error.
    const oneChar = await search("a", recep);
    expect(oneChar.statusCode).toBe(200);
    expect((oneChar.json() as ParentSearchResponse).results).toHaveLength(0);
  });

  it("caps results at the limit", async () => {
    for (let i = 0; i < PARENT_SEARCH_LIMIT + 5; i += 1) {
      await seedParent({ first: `Zara${i}`, last: "Common" });
    }
    const recep = await loginStaff("0712000001", "7421");
    const body = (await search("Common", recep)).json() as ParentSearchResponse;
    expect(body.results.length).toBeLessThanOrEqual(PARENT_SEARCH_LIMIT);
  });

  it("p95 search latency ≤300ms against a 10k-parent fixture (AC2)", async () => {
    // Seed ~10k parents in batched inserts (keep the test tractable).
    const BATCH = 1_000;
    const TOTAL = 10_000;
    for (let b = 0; b < TOTAL / BATCH; b += 1) {
      const userVals = [];
      for (let i = 0; i < BATCH; i += 1) {
        const n = b * BATCH + i;
        userVals.push({ phone: `+2547${String(20_000_000 + n)}`, pinHash: "x" });
      }
      const insertedUsers = await dbh.db.insert(users).values(userVals).returning();
      await dbh.db.insert(wallets).values(insertedUsers.map((u) => ({ userId: u.id })));
      await dbh.db.insert(parents).values(
        insertedUsers.map((u, i) => ({
          userId: u.id,
          firstName: `Perf${b * BATCH + i}`,
          lastName: "Loadtest",
        })),
      );
    }
    const recep = await loginStaff("0712000001", "7421");

    const samples: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const t0 = performance.now();
      const res = await search(`Perf${1000 + i}`, recep);
      samples.push(performance.now() - t0);
      expect(res.statusCode).toBe(200);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95) - 1] ?? samples[samples.length - 1]!;
    expect(p95).toBeLessThanOrEqual(300);
  }, 60_000);
});
