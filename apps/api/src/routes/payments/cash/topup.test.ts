import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { parents, smsOutbox, users, wallets, walletLedger, auditOutbox } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../../app.js";

/**
 * P1-E04-S06 — Reception/Cashier cash top-up route. Integration via app.inject
 * with real staff sessions (+ CSRF). Covers the credit applied (AC2), the
 * Reception/Cashier-only role guard (AC1), receipt/SMS-stub (AC3), audit (DoD),
 * and idempotency.
 */
describe("Cash top-up by Reception (P1-E04-S06)", () => {
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
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };

  let seq = 0;
  /** Seed a parent + wallet; return the parent (user) id + phone. */
  async function seedParent(): Promise<{ parentId: string; phone: string }> {
    seq += 1;
    const phone = `+25473${String(3000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    await dbh.db.insert(wallets).values({ userId: u!.id });
    await dbh.db.insert(parents).values({ userId: u!.id, firstName: "P", lastName: "Q" });
    return { parentId: u!.id, phone };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "reception"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "cashier"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "packer"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000004", "7424", "accountant"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const doTopup = (
    body: Record<string, unknown>,
    creds: { session: string; csrfCookie: string; csrfToken: string },
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(creds.session);
    if (csrf) cookieParts.push(creds.csrfCookie);
    return app.inject({
      method: "POST",
      url: "/payments/cash/topup",
      headers: {
        cookie: cookieParts.join("; "),
        ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}),
      },
      payload: body,
    });
  };

  it("reception records a cash top-up → 201, credit applied (AC1/AC2)", async () => {
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup({ parentId, amount: 30_000 }, recep);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.source).toBe("cash:reception");
    expect(body.replayed).toBe(false);

    const [row] = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.id, body.ledgerEntryId));
    expect(row!.kind).toBe("topup");
    expect(row!.source).toBe("cash:reception");
    expect(row!.amount).toBe(30_000);
    // posted_by is the reception staff user id, not the parent.
    const [recepUser] = await dbh.db
      .select()
      .from(users)
      .where(eq(users.phone, "+254712000001"));
    expect(row!.postedBy).toBe(recepUser!.id);
  });

  it("cashier is also allowed → 201 (AC1)", async () => {
    const { parentId } = await seedParent();
    const cashier = await loginStaff("0712000002", "7422");
    const res = await doTopup({ parentId, amount: 10_000 }, cashier);
    expect(res.statusCode).toBe(201);
  });

  it("packer (no create payment) is rejected → 403 (AC1)", async () => {
    const { parentId } = await seedParent();
    const packer = await loginStaff("0712000003", "7423");
    const res = await doTopup({ parentId, amount: 10_000 }, packer);
    expect(res.statusCode).toBe(403);
  });

  it("accountant (read-only) is rejected → 403 (AC1)", async () => {
    const { parentId } = await seedParent();
    const acct = await loginStaff("0712000004", "7424");
    const res = await doTopup({ parentId, amount: 10_000 }, acct);
    expect(res.statusCode).toBe(403);
  });

  it("unauthenticated request → 401", async () => {
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup({ parentId, amount: 10_000 }, recep, { auth: false });
    expect(res.statusCode).toBe(401);
  });

  it("missing CSRF token → 403", async () => {
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup({ parentId, amount: 10_000 }, recep, { csrf: false });
    expect(res.statusCode).toBe(403);
  });

  it("non-integer / non-positive amount → 400", async () => {
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    expect((await doTopup({ parentId, amount: 0 }, recep)).statusCode).toBe(400);
    expect((await doTopup({ parentId, amount: 12.5 }, recep)).statusCode).toBe(400);
  });

  it("unknown parent → 404", async () => {
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup(
      { parentId: "00000000-0000-0000-0000-000000000000", amount: 10_000 },
      recep,
    );
    expect(res.statusCode).toBe(404);
  });

  it("queues an SMS-stub receipt for the parent (AC3)", async () => {
    const { parentId, phone } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    await doTopup({ parentId, amount: 10_000 }, recep);
    const out = (await dbh.db.select().from(smsOutbox)).filter((r) => r.phone === phone);
    expect(out).toHaveLength(1);
    expect(out[0]!.template).toBe("wallet.topup.cash");
  });

  it("writes an audit row naming the staff actor (DoD)", async () => {
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    await doTopup({ parentId, amount: 10_000 }, recep);
    const [recepUser] = await dbh.db
      .select()
      .from(users)
      .where(eq(users.phone, "+254712000001"));
    const rows = (await dbh.db.select().from(auditOutbox)).filter(
      (r) => r.action === "payment.cash.topup",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(recepUser!.id);
  });

  it("idempotent: same key replays, posts one credit, notifies once", async () => {
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const body = { parentId, amount: 20_000, idempotencyKey: "dup" };
    const first = await doTopup(body, recep);
    const second = await doTopup(body, recep);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().replayed).toBe(true);
    const topups = (await dbh.db.select().from(walletLedger)).filter((r) => r.kind === "topup");
    expect(topups).toHaveLength(1);
    const out = await dbh.db.select().from(smsOutbox);
    expect(out).toHaveLength(1);
  });
});
