import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, floatAccounts, reconciliationAdjustments, users, wallets } from "@bm/db";
import { post as postLedger } from "@bm/wallet";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P1-E06-S02 — daily reconciliation read model + adjusting-entry dual-approval.
 * Integration via app.inject with real staff sessions (+ CSRF).
 */
describe("Daily reconciliation (P1-E06-S02)", () => {
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

  const req = (
    method: "GET" | "POST",
    url: string,
    creds: Creds,
    payload?: Record<string, unknown>,
    opts: { auth?: boolean } = {},
  ) => {
    const { auth = true } = opts;
    const cookieParts = [creds.csrfCookie];
    if (auth) cookieParts.unshift(creds.session);
    return app.inject({
      method,
      url,
      headers: { cookie: cookieParts.join("; "), "x-csrf-token": creds.csrfToken },
      ...(payload ? { payload } : {}),
    });
  };

  let walletId: string;
  async function seedWallet(): Promise<string> {
    const [u] = await dbh.db.insert(users).values({ phone: "+254799000000", pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    return w!.id;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
    walletId = await seedWallet();
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  async function seedTill(opening = 0) {
    const [t] = await dbh.db
      .insert(floatAccounts)
      .values({ name: "Till", kind: "mpesa_till", openingBalance: opening, openingDate: "2026-05-25" })
      .returning();
    return t!.id;
  }

  it("computes per-account system balance + drift, no banner within tolerance (AC1/AC2)", async () => {
    const treasury = await loginStaff("+254712000002", "7422");
    const tillId = await seedTill();
    await postLedger(dbh.db, {
      walletId,
      amount: 50_000,
      kind: "topup",
      idempotencyKey: "t1",
      source: "mpesa",
      postedBy: "system",
      floatAccountId: tillId,
    });

    // real == system → no drift.
    const res = await req("GET", `/treasury/reconciliation?real[${tillId}]=50000`, treasury);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const row = body.rows.find((r: { floatAccountId: string }) => r.floatAccountId === tillId);
    expect(row.systemCents).toBe(50_000);
    expect(row.driftCents).toBe(0);
    expect(row.isDrifting).toBe(false);
    expect(body.hasDrift).toBe(false);
  });

  it("raises the banner when drift exceeds KES 100 (AC2)", async () => {
    const treasury = await loginStaff("+254712000002", "7422");
    const tillId = await seedTill();
    await postLedger(dbh.db, {
      walletId,
      amount: 50_000,
      kind: "topup",
      idempotencyKey: "t2",
      source: "mpesa",
      postedBy: "system",
      floatAccountId: tillId,
    });
    // real is 39_999 → drift 10_001 cents > 10_000 threshold.
    const res = await req("GET", `/treasury/reconciliation?real[${tillId}]=39999`, treasury);
    const body = res.json();
    const row = body.rows.find((r: { floatAccountId: string }) => r.floatAccountId === tillId);
    expect(row.driftCents).toBe(10_001);
    expect(row.isDrifting).toBe(true);
    expect(body.hasDrift).toBe(true);
  });

  it("leaves drift null when no real balance is supplied", async () => {
    const treasury = await loginStaff("+254712000002", "7422");
    const tillId = await seedTill();
    const res = await req("GET", "/treasury/reconciliation", treasury);
    const row = res.json().rows.find((r: { floatAccountId: string }) => r.floatAccountId === tillId);
    expect(row.realCents).toBeNull();
    expect(row.driftCents).toBeNull();
    expect(row.isDrifting).toBe(false);
  });

  it("forbids reception from the reconciliation screen", async () => {
    const reception = await loginStaff("+254712000003", "7423");
    const res = await req("GET", "/treasury/reconciliation", reception);
    expect(res.statusCode).toBe(403);
  });

  it("rejects an unauthenticated reconciliation read", async () => {
    const treasury = await loginStaff("+254712000002", "7422");
    const res = await req("GET", "/treasury/reconciliation", treasury, undefined, { auth: false });
    expect(res.statusCode).toBe(401);
  });

  it("admin posts an adjustment (pending, audited); treasury approves it (AC3/AC4)", async () => {
    const admin = await loginStaff("+254712000001", "7421");
    const treasury = await loginStaff("+254712000002", "7422");
    const tillId = await seedTill();

    const posted = await req("POST", "/treasury/reconciliation/adjustments", admin, {
      floatAccountId: tillId,
      amount: -2_500,
      reason: "Cash short at till close",
    });
    expect(posted.statusCode).toBe(201);
    expect(posted.json().status).toBe("pending");
    const adjId = posted.json().id;

    const approve = await req(
      "POST",
      `/treasury/reconciliation/adjustments/${adjId}/approve`,
      treasury,
    );
    expect(approve.statusCode).toBe(200);
    expect(approve.json().status).toBe("approved");

    const [row] = await dbh.db
      .select()
      .from(reconciliationAdjustments)
      .where(eq(reconciliationAdjustments.id, adjId));
    expect(row!.approvedBy).toBeTruthy();

    const actions = (await dbh.db.select().from(auditOutbox)).map((a) => a.action);
    expect(actions).toContain("treasury.reconciliation.adjustment.post");
    expect(actions).toContain("treasury.reconciliation.adjustment.approve");
  });

  it("forbids self-approval — dual-approval requires a second person (AC3)", async () => {
    const treasury = await loginStaff("+254712000002", "7422");
    const tillId = await seedTill();
    // Treasury both posts and tries to approve its own adjustment.
    const posted = await req("POST", "/treasury/reconciliation/adjustments", treasury, {
      floatAccountId: tillId,
      amount: 1_000,
      reason: "rounding",
    });
    const adjId = posted.json().id;
    const approve = await req(
      "POST",
      `/treasury/reconciliation/adjustments/${adjId}/approve`,
      treasury,
    );
    expect(approve.statusCode).toBe(403);
  });

  it("reception cannot post an adjustment (AC3)", async () => {
    const reception = await loginStaff("+254712000003", "7423");
    const tillId = await seedTill();
    const res = await req("POST", "/treasury/reconciliation/adjustments", reception, {
      floatAccountId: tillId,
      amount: 1_000,
      reason: "x",
    });
    expect(res.statusCode).toBe(403);
  });

  it("admin cannot approve (approval is treasury-only) and a double-approve 409s (AC3)", async () => {
    const admin = await loginStaff("+254712000001", "7421");
    const treasury = await loginStaff("+254712000002", "7422");
    const tillId = await seedTill();
    const adjId = (
      await req("POST", "/treasury/reconciliation/adjustments", admin, {
        floatAccountId: tillId,
        amount: 500,
        reason: "x",
      })
    ).json().id;

    const adminApprove = await req(
      "POST",
      `/treasury/reconciliation/adjustments/${adjId}/approve`,
      admin,
    );
    expect(adminApprove.statusCode).toBe(403);

    const ok = await req("POST", `/treasury/reconciliation/adjustments/${adjId}/approve`, treasury);
    expect(ok.statusCode).toBe(200);
    const again = await req(
      "POST",
      `/treasury/reconciliation/adjustments/${adjId}/approve`,
      treasury,
    );
    expect(again.statusCode).toBe(409);
  });

  it("validates the adjustment body (AC3)", async () => {
    const admin = await loginStaff("+254712000001", "7421");
    const tillId = await seedTill();
    const zero = await req("POST", "/treasury/reconciliation/adjustments", admin, {
      floatAccountId: tillId,
      amount: 0,
      reason: "x",
    });
    expect(zero.statusCode).toBe(400);
  });
});
