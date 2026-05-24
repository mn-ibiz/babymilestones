import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { parents, users, wallets, walletLedger, auditOutbox } from "@bm/db";
import { InMemorySessionStore, staffUserSeed, hashPin } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P1-E03-S08 — Wallet statement CSV export. Integration via app.inject.
 * Covers: CSV columns + running balance-after (AC1), parent exports own /
 * staff exports a given parent / parent cannot traverse to another (AC2),
 * sync ≤ 12 months vs async > 12 months (AC3), empty window, and the audit.
 */
describe("Wallet statement export (P1-E03-S08)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  const enqueued: { walletId: string; from: string; to: string; requestedBy: string }[] = [];

  const loginParent = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    return cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
  };
  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    return cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
  };

  let seq = 0;
  async function seedParent(): Promise<{ userId: string; walletId: string; phone: string }> {
    seq += 1;
    const phone = `+25472${String(5000000 + seq).slice(-7)}`;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone, pinHash: await hashPin("1357"), role: "parent" })
      .returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    await dbh.db.insert(parents).values({ userId: u!.id, firstName: "P", lastName: "Q" });
    return { userId: u!.id, walletId: w!.id, phone };
  }

  async function seedLedger(walletId: string) {
    await dbh.db.insert(walletLedger).values([
      {
        walletId,
        amount: 100_000,
        direction: "credit",
        kind: "topup",
        idempotencyKey: `t-${walletId}`,
        postedBy: "system",
        source: "mpesa",
        createdAt: new Date("2026-03-01T10:00:00Z"),
      },
      {
        walletId,
        amount: -20_000,
        direction: "debit",
        kind: "debit",
        idempotencyKey: `d-${walletId}`,
        postedBy: "system",
        source: "checkin",
        createdAt: new Date("2026-03-02T10:00:00Z"),
      },
    ]);
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    enqueued.length = 0;
    app = buildApp({
      db: dbh.db,
      sessions,
      enqueueStatement: (input) => enqueued.push(input),
    });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const url = (path: string, from = "2026-01-01", to = "2026-12-31") =>
    `${path}?from=${from}&to=${to}`;

  it("parent exports own statement: correct columns + running balance (AC1)", async () => {
    const { walletId, phone } = await seedParent();
    await seedLedger(walletId);
    const session = await loginParent(phone, "1357");

    const res = await app.inject({
      method: "GET",
      url: url("/parents/me/statement"),
      headers: { cookie: session },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const lines = res.body.trimEnd().split("\r\n");
    expect(lines[0]).toBe("timestamp,kind,direction,amount,balance after,reference");
    expect(lines[1]).toContain("1000.00,1000.00,mpesa");
    expect(lines[2]).toContain("-200.00,800.00,checkin");
  });

  it("empty window yields a header-only CSV", async () => {
    const { phone } = await seedParent();
    const session = await loginParent(phone, "1357");
    const res = await app.inject({
      method: "GET",
      url: url("/parents/me/statement"),
      headers: { cookie: session },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("timestamp,kind,direction,amount,balance after,reference\r\n");
  });

  it("unauthenticated → 401", async () => {
    const res = await app.inject({ method: "GET", url: url("/parents/me/statement") });
    expect(res.statusCode).toBe(401);
  });

  it("missing/invalid range → 400", async () => {
    const { phone } = await seedParent();
    const session = await loginParent(phone, "1357");
    const res = await app.inject({
      method: "GET",
      url: "/parents/me/statement",
      headers: { cookie: session },
    });
    expect(res.statusCode).toBe(400);
  });

  it("staff (reception) exports a given parent's statement (AC2)", async () => {
    const { userId, walletId } = await seedParent();
    await seedLedger(walletId);
    const staff = await loginStaff("0712000003", "7423");
    const res = await app.inject({
      method: "GET",
      url: url(`/parents/${userId}/statement`),
      headers: { cookie: staff },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("1000.00,1000.00,mpesa");
  });

  it("parent cannot export another parent's statement via the by-id route (AC2) → 403", async () => {
    const victim = await seedParent();
    const attacker = await seedParent();
    const session = await loginParent(attacker.phone, "1357");
    const res = await app.inject({
      method: "GET",
      url: url(`/parents/${victim.userId}/statement`),
      headers: { cookie: session },
    });
    expect(res.statusCode).toBe(403);
  });

  it("≤ 12-month range is generated synchronously (200 CSV) (AC3)", async () => {
    const { walletId, phone } = await seedParent();
    await seedLedger(walletId);
    const session = await loginParent(phone, "1357");
    const res = await app.inject({
      method: "GET",
      url: url("/parents/me/statement", "2026-01-01", "2027-01-01"),
      headers: { cookie: session },
    });
    expect(res.statusCode).toBe(200);
    expect(enqueued).toHaveLength(0);
  });

  it("> 12-month range is dispatched async (202, enqueued) (AC3)", async () => {
    const { walletId, phone } = await seedParent();
    const session = await loginParent(phone, "1357");
    const res = await app.inject({
      method: "GET",
      url: url("/parents/me/statement", "2024-01-01", "2026-06-01"),
      headers: { cookie: session },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe("pending");
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.walletId).toBe(walletId);
  });

  it("audits the sync export", async () => {
    const { walletId, phone } = await seedParent();
    await seedLedger(walletId);
    const session = await loginParent(phone, "1357");
    await app.inject({
      method: "GET",
      url: url("/parents/me/statement"),
      headers: { cookie: session },
    });
    const rows = (await dbh.db.select().from(auditOutbox)).filter(
      (r) => r.action === "wallet.statement.export",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.targetId).toBe(walletId);
  });

  it("unknown parent (staff route) → 404", async () => {
    const staff = await loginStaff("0712000003", "7423");
    const res = await app.inject({
      method: "GET",
      url: url("/parents/00000000-0000-0000-0000-000000000000/statement"),
      headers: { cookie: staff },
    });
    expect(res.statusCode).toBe(404);
  });
});
