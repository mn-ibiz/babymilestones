import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { parents, smsOutbox, users, wallets, walletLedger, auditOutbox } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { post as ledgerPost } from "@bm/wallet";
import { buildApp } from "../../app.js";

/**
 * P1-E03-S06 — Admin refund route. Integration via app.inject with real staff
 * sessions (+ CSRF). Covers admin-only enforcement (AC5), the reversing entry
 * (AC2), reason-code/over-refund validation (AC1/AC4), the SMS-stub queue (AC3),
 * audit (DoD), and idempotency.
 */
describe("Admin refund recording (P1-E03-S06)", () => {
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
  /** Seed a parent + wallet, topup 200k, post a 50k debit; return the debit id. */
  async function seedDebit(amount = 50_000): Promise<{ debitId: string; phone: string }> {
    seq += 1;
    const phone = `+25472${String(2000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    await dbh.db.insert(parents).values({ userId: u!.id, firstName: "P", lastName: "Q" });
    await ledgerPost(dbh.db, {
      walletId: w!.id,
      amount: 200_000,
      kind: "topup",
      idempotencyKey: `topup:${w!.id}`,
      source: "cash",
      postedBy: "system",
    });
    const debitRow = await ledgerPost(dbh.db, {
      walletId: w!.id,
      amount: -amount,
      kind: "debit",
      idempotencyKey: `debit:${w!.id}`,
      source: "checkin",
      postedBy: "reception",
    });
    return { debitId: debitRow.id, phone };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    // Seed one user per role we exercise.
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000004", "7424", "treasury"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const doRefund = (
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
      url: "/admin/refunds",
      headers: {
        cookie: cookieParts.join("; "),
        ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}),
      },
      payload: body,
    });
  };

  it("admin posts a reversing refund entry (AC2/AC5) → 201", async () => {
    const { debitId } = await seedDebit(50_000);
    const admin = await loginStaff("0712000001", "7421");
    const res = await doRefund(
      { originalEntryId: debitId, amount: 50_000, reasonCode: "service_not_rendered", note: "n" },
      admin,
    );
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.replayed).toBe(false);
    const [row] = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.id, body.ledgerEntryId));
    expect(row!.kind).toBe("refund");
    expect(row!.reversesEntryId).toBe(debitId);
    expect(row!.loyaltyClawbackPending).toBe(true);
  });

  it("super_admin is also allowed (AC5) → 201", async () => {
    const { debitId } = await seedDebit();
    const sa = await loginStaff("0712000002", "7422");
    const res = await doRefund(
      { originalEntryId: debitId, amount: 10_000, reasonCode: "goodwill" },
      sa,
    );
    expect(res.statusCode).toBe(201);
  });

  it("reception is rejected (AC5) → 403", async () => {
    const { debitId } = await seedDebit();
    const recep = await loginStaff("0712000003", "7423");
    const res = await doRefund(
      { originalEntryId: debitId, amount: 10_000, reasonCode: "x" },
      recep,
    );
    expect(res.statusCode).toBe(403);
  });

  it("treasury (create/read refund but NOT manage) is rejected (AC5) → 403", async () => {
    const { debitId } = await seedDebit();
    const treas = await loginStaff("0712000004", "7424");
    const res = await doRefund(
      { originalEntryId: debitId, amount: 10_000, reasonCode: "x" },
      treas,
    );
    expect(res.statusCode).toBe(403);
  });

  it("unauthenticated request → 401", async () => {
    const { debitId } = await seedDebit();
    const admin = await loginStaff("0712000001", "7421");
    const res = await doRefund(
      { originalEntryId: debitId, amount: 10_000, reasonCode: "x" },
      admin,
      { auth: false },
    );
    expect(res.statusCode).toBe(401);
  });

  it("missing reason code → 400 (AC1)", async () => {
    const { debitId } = await seedDebit();
    const admin = await loginStaff("0712000001", "7421");
    const res = await doRefund({ originalEntryId: debitId, amount: 10_000 }, admin);
    expect(res.statusCode).toBe(400);
  });

  it("refund exceeding remaining-refundable → 409 (AC4)", async () => {
    const { debitId } = await seedDebit(50_000);
    const admin = await loginStaff("0712000001", "7421");
    const res = await doRefund(
      { originalEntryId: debitId, amount: 60_000, reasonCode: "x" },
      admin,
    );
    expect(res.statusCode).toBe(409);
  });

  it("unknown original entry → 404", async () => {
    const admin = await loginStaff("0712000001", "7421");
    const res = await doRefund(
      {
        originalEntryId: "00000000-0000-0000-0000-000000000000",
        amount: 10_000,
        reasonCode: "x",
      },
      admin,
    );
    expect(res.statusCode).toBe(404);
  });

  it("queues an SMS-stub notification for the parent (AC3)", async () => {
    const { debitId, phone } = await seedDebit();
    const admin = await loginStaff("0712000001", "7421");
    await doRefund({ originalEntryId: debitId, amount: 10_000, reasonCode: "x" }, admin);
    const out = (await dbh.db.select().from(smsOutbox)).filter((r) => r.phone === phone);
    expect(out).toHaveLength(1);
    expect(out[0]!.template).toBe("wallet.refund");
  });

  it("writes an audit row (DoD)", async () => {
    const { debitId } = await seedDebit();
    const admin = await loginStaff("0712000001", "7421");
    await doRefund({ originalEntryId: debitId, amount: 10_000, reasonCode: "x" }, admin);
    const rows = (await dbh.db.select().from(auditOutbox)).filter(
      (r) => r.action === "wallet.refund",
    );
    expect(rows).toHaveLength(1);
  });

  it("idempotent: same key replays, posts one refund row", async () => {
    const { debitId } = await seedDebit(50_000);
    const admin = await loginStaff("0712000001", "7421");
    const body = { originalEntryId: debitId, amount: 50_000, reasonCode: "x", idempotencyKey: "dup" };
    const first = await doRefund(body, admin);
    const second = await doRefund(body, admin);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().replayed).toBe(true);
    const refunds = (await dbh.db.select().from(walletLedger)).filter((r) => r.kind === "refund");
    expect(refunds).toHaveLength(1);
  });
});
