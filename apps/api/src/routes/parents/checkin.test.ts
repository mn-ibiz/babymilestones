import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { invoices, parents, users, wallets } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { post as ledgerPost } from "@bm/wallet";
import { buildApp } from "../../app.js";

/**
 * P1-E03-S05 — Reception check-in debit route. Integration via app.inject with a
 * real reception staff session (+ CSRF). Covers the three resolved outcomes, the
 * idempotent replay, and the double-check-in conflict.
 */
describe("Reception check-in debit (P1-E03-S05)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let staffSession: string;
  let staffCsrfCookie: string;
  let staffCsrfToken: string;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };

  let seq = 0;
  async function seedParentWallet(autoCredit = false): Promise<{ parentId: string; walletId: string }> {
    seq += 1;
    const phone = `+25472${String(2000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db
      .insert(wallets)
      .values({ userId: u!.id, autoCreditEnabled: autoCredit })
      .returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "P", lastName: "Q" })
      .returning();
    return { parentId: p!.id, walletId: w!.id };
  }

  async function pendingInvoice(parentId: string, amount: number): Promise<string> {
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId, amountDue: amount, status: "pending" })
      .returning();
    return inv!.id;
  }

  async function topup(walletId: string, amount: number, key: string) {
    await ledgerPost(dbh.db, {
      walletId,
      amount,
      kind: "topup",
      idempotencyKey: key,
      source: "cash",
      postedBy: "system",
    });
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db
      .insert(users)
      .values(await staffUserSeed("+254712000001", "7421", "reception"))
      .returning();
    const s = await loginStaff("0712000001", "7421");
    staffSession = s.session;
    staffCsrfCookie = s.csrfCookie;
    staffCsrfToken = s.csrfToken;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const checkIn = (
    body: Record<string, unknown>,
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(staffSession);
    if (csrf) cookieParts.push(staffCsrfCookie);
    const headers: Record<string, string> = {};
    if (cookieParts.length) headers["cookie"] = cookieParts.join("; ");
    if (csrf) headers["x-csrf-token"] = staffCsrfToken;
    return app.inject({ method: "POST", url: "/parents/check-in", headers, payload: body });
  };

  it("rejects an unauthenticated check-in", async () => {
    const res = await checkIn({ invoiceId: "00000000-0000-0000-0000-000000000000" }, { auth: false, csrf: false });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a check-in without a CSRF token", async () => {
    const res = await checkIn({ invoiceId: "00000000-0000-0000-0000-000000000000" }, { csrf: false });
    expect(res.statusCode).toBe(403);
  });

  it("AC3: funded check-in → settled, wallet debited", async () => {
    const { parentId, walletId } = await seedParentWallet();
    await topup(walletId, 5_000, "t1");
    const invoiceId = await pendingInvoice(parentId, 3_000);

    const res = await checkIn({ invoiceId });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: "settled", debited: 3_000, replayed: false });

    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(inv!.status).toBe("settled");
  });

  it("AC4: underfunded + auto-credit → settled_on_credit", async () => {
    const { parentId, walletId } = await seedParentWallet(true);
    await topup(walletId, 1_000, "t1");
    const invoiceId = await pendingInvoice(parentId, 3_000);

    const res = await checkIn({ invoiceId });
    expect(res.statusCode).toBe(200);
    expect(res.json().outcome).toBe("settled_on_credit");
  });

  it("AC5: underfunded + no auto-credit → outstanding, booking still proceeds (200)", async () => {
    const { parentId, walletId } = await seedParentWallet(false);
    await topup(walletId, 1_000, "t1");
    const invoiceId = await pendingInvoice(parentId, 3_000);

    const res = await checkIn({ invoiceId });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: "outstanding", debited: 0 });
  });

  it("AC2: replayed check-in is idempotent (replayed=true)", async () => {
    const { parentId, walletId } = await seedParentWallet();
    await topup(walletId, 5_000, "t1");
    const invoiceId = await pendingInvoice(parentId, 3_000);

    await checkIn({ invoiceId });
    const res = await checkIn({ invoiceId });
    expect(res.statusCode).toBe(200);
    expect(res.json().replayed).toBe(true);
  });

  it("AC6: a distinct second check-in for the same invoice → 409", async () => {
    const { parentId, walletId } = await seedParentWallet();
    await topup(walletId, 10_000, "t1");
    const invoiceId = await pendingInvoice(parentId, 3_000);

    await checkIn({ invoiceId });
    const res = await checkIn({ invoiceId, idempotencyKey: "retry-key" });
    expect(res.statusCode).toBe(409);
  });

  it("404 for an unknown invoice", async () => {
    const res = await checkIn({ invoiceId: "00000000-0000-0000-0000-000000000000" });
    expect(res.statusCode).toBe(404);
  });
});
