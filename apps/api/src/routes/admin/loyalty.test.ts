import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { users, loyaltyLedger, auditOutbox } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P3-E04-S03 — Admin manual loyalty adjustment (route). Integration via
 * app.inject with real staff sessions + CSRF. Covers:
 *  - credit/debit writes a `loyalty_ledger` adjustment row stamped with the admin
 *    (AC2) and returns the new balance,
 *  - audit_outbox gets a `loyalty.adjust` row (AC3),
 *  - permission: admin / super_admin only; reception/cashier 403; anon 401;
 *    no-CSRF 403 (AC4),
 *  - validation: zero / over-bounds / empty-reason → 400; unknown parent → 404.
 */
describe("Admin manual loyalty adjustment (P3-E04-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let parentId: string;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/staff/login",
      payload: { phone, pin },
    });
    const cookies = (res.headers["set-cookie"] as string[] | undefined) ?? [];
    const session = cookies.find((c) => c.startsWith("bm_session="))?.split(";")[0] ?? "";
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))?.split(";")[0] ?? "";
    return {
      session,
      csrfCookie,
      csrfToken: (res.json().csrfToken as string) ?? "",
      status: res.statusCode,
    };
  };

  type Creds = { session: string; csrfCookie: string; csrfToken: string };

  const adjust = (
    pid: string,
    body: Record<string, unknown>,
    creds: Creds,
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(creds.session);
    if (csrf) cookieParts.push(creds.csrfCookie);
    return app.inject({
      method: "POST",
      url: `/admin/parents/${pid}/loyalty/adjust`,
      headers: {
        cookie: cookieParts.join("; "),
        ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}),
      },
      payload: body,
    });
  };

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000004", "7424", "cashier"));
    const [p] = await dbh.db
      .insert(users)
      .values({ phone: "+254700000111", role: "parent" })
      .returning();
    parentId = p!.id;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("admin credits points → 201, writes an adjustment row stamped with the admin (AC1/AC2)", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await adjust(parentId, { points: 250, reason: "goodwill — late session" }, admin);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.points).toBe(250);
    expect(body.balance).toBe(250);

    const rows = await dbh.db
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.parentId, parentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("adjustment");
    expect(rows[0]!.pointsDelta).toBe(250);
    // posted_by is the acting admin's user id.
    const [adminUser] = await dbh.db.select().from(users).where(eq(users.phone, "+254712000002"));
    expect(rows[0]!.postedBy).toBe(adminUser!.id);
  });

  it("admin debits points → balance decreases", async () => {
    const admin = await loginStaff("0712000002", "7422");
    await adjust(parentId, { points: 100, reason: "seed" }, admin);
    const res = await adjust(parentId, { points: -40, reason: "correction" }, admin);
    expect(res.statusCode).toBe(201);
    expect(res.json().balance).toBe(60);
  });

  it("a debit beyond balance is allowed and flagged as negative carry (S02)", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const res = await adjust(parentId, { points: -30, reason: "clerical fix" }, sa);
    expect(res.statusCode).toBe(201);
    expect(res.json().balance).toBe(-30);
    expect(res.json().negativeCarry).toBe(true);
  });

  it("writes a loyalty.adjust audit row (AC3)", async () => {
    const admin = await loginStaff("0712000002", "7422");
    await adjust(parentId, { points: 50, reason: "goodwill" }, admin);
    const rows = await dbh.db.select().from(auditOutbox);
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("loyalty.adjust");
  });

  it("super_admin may also adjust (AC4)", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const res = await adjust(parentId, { points: 10, reason: "ok" }, sa);
    expect(res.statusCode).toBe(201);
  });

  it("rejects a zero adjustment → 400", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await adjust(parentId, { points: 0, reason: "noop" }, admin);
    expect(res.statusCode).toBe(400);
  });

  it("rejects an empty reason → 400", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await adjust(parentId, { points: 10, reason: "   " }, admin);
    expect(res.statusCode).toBe(400);
  });

  it("rejects an out-of-bounds adjustment → 400", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await adjust(parentId, { points: 9_999_999, reason: "too big" }, admin);
    expect(res.statusCode).toBe(400);
  });

  it("unknown parent → 404", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await adjust(
      "00000000-0000-0000-0000-000000000000",
      { points: 10, reason: "x" },
      admin,
    );
    expect(res.statusCode).toBe(404);
  });

  it("refuses to adjust a staff user via this surface → 404", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const [staff] = await dbh.db.select().from(users).where(eq(users.phone, "+254712000003"));
    const res = await adjust(staff!.id, { points: 10, reason: "x" }, admin);
    expect(res.statusCode).toBe(404);
  });

  it("reception (read-only loyalty) is rejected → 403", async () => {
    const recep = await loginStaff("0712000003", "7423");
    const res = await adjust(parentId, { points: 10, reason: "x" }, recep);
    expect(res.statusCode).toBe(403);
  });

  it("cashier is rejected → 403", async () => {
    const cashier = await loginStaff("0712000004", "7424");
    const res = await adjust(parentId, { points: 10, reason: "x" }, cashier);
    expect(res.statusCode).toBe(403);
  });

  it("unauthenticated → 401", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await adjust(parentId, { points: 10, reason: "x" }, admin, { auth: false });
    expect(res.statusCode).toBe(401);
  });

  it("missing CSRF → 403", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await adjust(parentId, { points: 10, reason: "x" }, admin, { csrf: false });
    expect(res.statusCode).toBe(403);
  });
});
