import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { parents, users, wallets, walletLedger } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import type { RecentTransactionsResponse } from "@bm/contracts";
import { buildApp } from "../../app.js";

/**
 * P1-E05-S05 — Reception recent-transactions panel. Integration via app.inject
 * with real staff sessions. Covers: latest-10 newest-first ordering + limit,
 * the running balance-after + fields (AC1), empty case, unknown parent → 404,
 * and the staff-only read guard (packer rejected, unauthenticated rejected).
 */
describe("Reception recent transactions (P1-E05-S05)", () => {
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
  async function seedParent(): Promise<{ userId: string; walletId: string }> {
    seq += 1;
    const phone = `+25473${String(2000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Asha", lastName: "M" });
    return { userId: u!.id, walletId: w!.id };
  }

  async function postEntry(
    walletId: string,
    amount: number,
    kind: string,
    direction: string,
    source: string,
    key: string,
    createdAt: Date,
  ) {
    await dbh.db.insert(walletLedger).values({
      walletId,
      amount,
      direction,
      kind,
      idempotencyKey: key,
      postedBy: "system",
      source,
      createdAt,
    });
  }

  const getRecent = (userId: string, creds: { session: string }, opts: { auth?: boolean } = {}) => {
    const { auth = true } = opts;
    return app.inject({
      method: "GET",
      url: `/reception/parents/${userId}/recent-transactions`,
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

  it("returns the latest 10 newest-first with fields + balance-after (AC1)", async () => {
    const p = await seedParent();
    for (let i = 0; i < 12; i += 1) {
      await postEntry(
        p.walletId,
        1_000,
        "topup",
        "credit",
        "cash:reception",
        `k-${i}`,
        new Date(`2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
      );
    }
    const recep = await loginStaff("0712000001", "7421");
    const res = await getRecent(p.userId, recep);
    expect(res.statusCode).toBe(200);
    const body = res.json() as RecentTransactionsResponse;
    expect(body.transactions).toHaveLength(10);
    // Newest first.
    expect(body.transactions[0]!.createdAt).toBe("2026-01-12T00:00:00.000Z");
    // 12 credits of 1000 → full balance 12000 = balance-after of the newest row.
    expect(body.transactions[0]!.balanceAfterCents).toBe(12_000);
    expect(body.transactions[0]).toMatchObject({
      kind: "topup",
      direction: "credit",
      amountCents: 1_000,
      source: "cash:reception",
    });
  });

  it("never-funded parent → empty list (empty case)", async () => {
    const p = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const res = await getRecent(p.userId, recep);
    expect(res.statusCode).toBe(200);
    expect((res.json() as RecentTransactionsResponse).transactions).toEqual([]);
  });

  it("unknown parent → 404", async () => {
    const recep = await loginStaff("0712000001", "7421");
    const res = await getRecent("00000000-0000-0000-0000-000000000000", recep);
    expect(res.statusCode).toBe(404);
  });

  it("packer (no read wallet) is rejected → 403 (staff-only)", async () => {
    const p = await seedParent();
    const packer = await loginStaff("0712000003", "7423");
    expect((await getRecent(p.userId, packer)).statusCode).toBe(403);
  });

  it("unauthenticated request → 401", async () => {
    const p = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    expect((await getRecent(p.userId, recep, { auth: false })).statusCode).toBe(401);
  });
});
