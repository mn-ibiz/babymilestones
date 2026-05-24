import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { parents, users, wallets, auditOutbox, invoices } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { debit } from "@bm/wallet";
import { buildApp } from "../../app.js";

/**
 * P1-E03-S07 — Per-parent auto-credit toggle. Integration via app.inject with
 * real staff sessions (+ CSRF). Covers default FALSE (AC1), admin/super_admin
 * may flip / Reception+others rejected (AC2), audit of the change (AC3), and the
 * behavioural consequence: flipping ON makes an underfunded check-in debit go
 * negative + settle_on_credit instead of leaving the invoice outstanding.
 */
describe("Auto-credit toggle per parent (P1-E03-S07)", () => {
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
  /** Seed a parent + wallet; returns the parent's userId + walletId + parentId. */
  async function seedParent(): Promise<{ userId: string; walletId: string; parentId: string }> {
    seq += 1;
    const phone = `+25472${String(3000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "P", lastName: "Q" })
      .returning();
    return { userId: u!.id, walletId: w!.id, parentId: p!.id };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000004", "7424", "cashier"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const setToggle = (
    userId: string,
    body: Record<string, unknown>,
    creds: { session: string; csrfCookie: string; csrfToken: string },
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(creds.session);
    if (csrf) cookieParts.push(creds.csrfCookie);
    return app.inject({
      method: "PATCH",
      url: `/admin/parents/${userId}/auto-credit`,
      headers: {
        cookie: cookieParts.join("; "),
        ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}),
      },
      payload: body,
    });
  };

  const getToggle = (
    userId: string,
    creds: { session: string },
  ) =>
    app.inject({
      method: "GET",
      url: `/admin/parents/${userId}/auto-credit`,
      headers: { cookie: creds.session },
    });

  it("defaults FALSE (AC1)", async () => {
    const { userId } = await seedParent();
    const admin = await loginStaff("0712000001", "7421");
    const res = await getToggle(userId, admin);
    expect(res.statusCode).toBe(200);
    expect(res.json().autoCreditEnabled).toBe(false);
  });

  it("admin can flip the toggle ON (AC2) → 200 and persisted", async () => {
    const { userId, walletId } = await seedParent();
    const admin = await loginStaff("0712000001", "7421");
    const res = await setToggle(userId, { autoCreditEnabled: true }, admin);
    expect(res.statusCode).toBe(200);
    expect(res.json().autoCreditEnabled).toBe(true);
    const [w] = await dbh.db.select().from(wallets).where(eq(wallets.id, walletId));
    expect(w!.autoCreditEnabled).toBe(true);
  });

  it("super_admin can also flip (AC2) → 200", async () => {
    const { userId } = await seedParent();
    const sa = await loginStaff("0712000002", "7422");
    const res = await setToggle(userId, { autoCreditEnabled: true }, sa);
    expect(res.statusCode).toBe(200);
  });

  it("reception is rejected (AC2) → 403", async () => {
    const { userId } = await seedParent();
    const recep = await loginStaff("0712000003", "7423");
    const res = await setToggle(userId, { autoCreditEnabled: true }, recep);
    expect(res.statusCode).toBe(403);
  });

  it("cashier (read wallet but not manage) is rejected (AC2) → 403", async () => {
    const { userId } = await seedParent();
    const cashier = await loginStaff("0712000004", "7424");
    const res = await setToggle(userId, { autoCreditEnabled: true }, cashier);
    expect(res.statusCode).toBe(403);
  });

  it("unauthenticated request → 401", async () => {
    const { userId } = await seedParent();
    const admin = await loginStaff("0712000001", "7421");
    const res = await setToggle(userId, { autoCreditEnabled: true }, admin, { auth: false });
    expect(res.statusCode).toBe(401);
  });

  it("invalid body (non-boolean) → 400", async () => {
    const { userId } = await seedParent();
    const admin = await loginStaff("0712000001", "7421");
    const res = await setToggle(userId, { autoCreditEnabled: "yes" }, admin);
    expect(res.statusCode).toBe(400);
  });

  it("unknown parent → 404", async () => {
    const admin = await loginStaff("0712000001", "7421");
    const res = await setToggle(
      "00000000-0000-0000-0000-000000000000",
      { autoCreditEnabled: true },
      admin,
    );
    expect(res.statusCode).toBe(404);
  });

  it("writes an audit row with before/after (AC3)", async () => {
    const { userId, walletId } = await seedParent();
    const admin = await loginStaff("0712000001", "7421");
    await setToggle(userId, { autoCreditEnabled: true }, admin);
    const rows = (await dbh.db.select().from(auditOutbox)).filter(
      (r) => r.action === "wallet.auto_credit_toggle",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.targetId).toBe(walletId);
    const payload = rows[0]!.payload as Record<string, unknown>;
    expect(payload.before).toBe(false);
    expect(payload.after).toBe(true);
  });

  it("flipping ON changes an underfunded check-in: debits anyway + settles on credit (AC2 behaviour)", async () => {
    const { userId, walletId, parentId } = await seedParent();
    // Empty wallet; create a pending invoice for 50k.
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId, amountDue: 50_000, status: "pending" })
      .returning();

    const admin = await loginStaff("0712000001", "7421");
    // OFF (default): underfunded debit leaves the invoice outstanding.
    const offResult = await debit(dbh.db, {
      walletId,
      invoiceId: inv!.id,
      idempotencyKey: `ci:${inv!.id}`,
      source: "checkin",
      postedBy: userId,
    });
    expect(offResult.outcome).toBe("outstanding");

    // Flip ON via the endpoint, then a fresh underfunded check-in settles on credit.
    await setToggle(userId, { autoCreditEnabled: true }, admin);
    const [inv2] = await dbh.db
      .insert(invoices)
      .values({ parentId, amountDue: 30_000, status: "pending" })
      .returning();
    const onResult = await debit(dbh.db, {
      walletId,
      invoiceId: inv2!.id,
      idempotencyKey: `ci:${inv2!.id}`,
      source: "checkin",
      postedBy: userId,
    });
    expect(onResult.outcome).toBe("settled_on_credit");
    expect(onResult.debited).toBe(30_000);
  });
});
