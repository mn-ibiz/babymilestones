import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  auditOutbox,
  mpesaStkRequests,
  parents,
  paystackTransactions,
  smsOutbox,
  users,
  wallets,
  walletLedger,
} from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import type { DarajaTransport, PaystackTransport } from "@bm/payments";
import { buildApp } from "../../app.js";

/**
 * P1-E05-S03 — Reception unified top-up. One staff endpoint dispatching by method:
 * cash credits synchronously + prints (AC3), M-Pesa STK pushes to the parent's
 * phone and is credited async on callback (AC2), Paystack inits a hosted checkout.
 * Staff-only via rbac (AC1) and every method writes an audit row naming the method
 * (AC4). Provider transports are injected/mocked — no real network.
 */
const mpesaConfig = {
  baseUrl: "https://sandbox.safaricom.co.ke",
  consumerKey: "ck",
  consumerSecret: "cs",
  shortcode: "174379",
  passkey: "pk",
  callbackUrl: "https://api.babymilestones.co.ke/payments/mpesa/callback",
} as const;

const paystackConfig = {
  baseUrl: "https://api.paystack.co",
  secretKey: "sk_test",
  callbackUrl: "https://api.babymilestones.co.ke/payments/paystack/verify",
} as const;

function darajaTransport(
  stkResponse: Record<string, unknown> = {
    MerchantRequestID: "mr-1",
    CheckoutRequestID: "ws_CO_123",
    ResponseCode: "0",
    ResponseDescription: "Success",
  },
): DarajaTransport {
  return async (url) => {
    if (url.includes("/oauth/")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: "3599" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(stkResponse), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function paystackTransport(
  initResponse: Record<string, unknown> = {
    status: true,
    data: { authorization_url: "https://checkout.paystack.com/abc123", reference: "ignored" },
  },
): PaystackTransport {
  return async () =>
    new Response(JSON.stringify(initResponse), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

describe("POST /reception/topup (P1-E05-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const build = (opts: { mpesaOk?: boolean; paystackOk?: boolean } = {}) => {
    const { mpesaOk = true, paystackOk = true } = opts;
    return buildApp({
      db: dbh.db,
      sessions,
      ...(mpesaOk
        ? { mpesa: { config: mpesaConfig, transport: darajaTransport() } }
        : {}),
      ...(paystackOk
        ? { paystack: { config: paystackConfig, transport: paystackTransport() } }
        : {}),
    });
  };

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
  async function seedParent(opts: { email?: string | null } = {}): Promise<{
    parentId: string;
    phone: string;
  }> {
    seq += 1;
    const phone = `+25473${String(4000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    await dbh.db.insert(wallets).values({ userId: u!.id });
    await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "P", lastName: "Q", email: opts.email ?? null });
    return { parentId: u!.id, phone };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = build();
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
      url: "/reception/topup",
      headers: {
        cookie: cookieParts.join("; "),
        ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}),
      },
      payload: body,
    });
  };

  // --- Cash (synchronous credit + receipt, AC3) ---------------------------

  it("cash → 201 settled, posts one credit, audit names method=cash (AC3/AC4)", async () => {
    const { parentId, phone } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup({ parentId, method: "cash", amount: 30_000 }, recep);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.method).toBe("cash");
    expect(body.status).toBe("settled");
    expect(body.transactionId).toBeNull();
    expect(typeof body.ledgerEntryId).toBe("string");

    const [row] = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.id, body.ledgerEntryId));
    expect(row!.kind).toBe("topup");
    expect(row!.source).toBe("cash:reception");
    expect(row!.amount).toBe(30_000);

    const audits = (await dbh.db.select().from(auditOutbox)).filter(
      (r) => r.action === "reception.topup",
    );
    expect(audits).toHaveLength(1);
    expect((audits[0]!.payload as { method?: string }).method).toBe("cash");

    const out = (await dbh.db.select().from(smsOutbox)).filter((r) => r.phone === phone);
    expect(out).toHaveLength(1);
  });

  it("cash is idempotent on key: replays, posts one credit", async () => {
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const body = { parentId, method: "cash", amount: 20_000, idempotencyKey: "dup-1" };
    const first = await doTopup(body, recep);
    const second = await doTopup(body, recep);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().replayed).toBe(true);
    const topups = (await dbh.db.select().from(walletLedger)).filter((r) => r.kind === "topup");
    expect(topups).toHaveLength(1);
  });

  // --- M-Pesa STK (async, AC2) --------------------------------------------

  it("mpesa_stk → 202 pending, persists STK request to parent phone, no credit yet (AC2)", async () => {
    const { parentId, phone } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup({ parentId, method: "mpesa_stk", amount: 100_00 }, recep);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.method).toBe("mpesa_stk");
    expect(body.status).toBe("pending");
    expect(typeof body.transactionId).toBe("string");

    const [stk] = await dbh.db
      .select()
      .from(mpesaStkRequests)
      .where(eq(mpesaStkRequests.checkoutRequestId, body.transactionId));
    expect(stk!.parentId).toBe(parentId);
    expect(stk!.phone).toBe(phone);
    expect(stk!.state).toBe("STK_SENT");

    // Async: nothing credited at initiate time.
    const topups = (await dbh.db.select().from(walletLedger)).filter((r) => r.kind === "topup");
    expect(topups).toHaveLength(0);

    const audits = (await dbh.db.select().from(auditOutbox)).filter(
      (r) => r.action === "reception.topup",
    );
    expect((audits[0]!.payload as { method?: string }).method).toBe("mpesa_stk");
  });

  it("mpesa_stk status polls live via the STK status endpoint (AC2)", async () => {
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const init = await doTopup({ parentId, method: "mpesa_stk", amount: 100_00 }, recep);
    const id = init.json().transactionId as string;
    const status = await app.inject({
      method: "GET",
      url: `/reception/topup/mpesa_stk/${id}`,
      headers: { cookie: recep.session },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().state).toBe("STK_SENT");
  });

  // --- Paystack (init hosted checkout) ------------------------------------

  it("paystack_card → 202 pending with authorizationUrl + reference (AC1)", async () => {
    const { parentId } = await seedParent({ email: "p@example.com" });
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup({ parentId, method: "paystack_card", amount: 100_00 }, recep);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.method).toBe("paystack_card");
    expect(body.status).toBe("pending");
    expect(body.authorizationUrl).toBe("https://checkout.paystack.com/abc123");
    expect(typeof body.transactionId).toBe("string");

    const [tx] = await dbh.db
      .select()
      .from(paystackTransactions)
      .where(eq(paystackTransactions.reference, body.transactionId));
    expect(tx!.parentId).toBe(parentId);
    expect(tx!.state).toBe("INITIALIZED");
  });

  it("paystack_card without a parent email → 422", async () => {
    const { parentId } = await seedParent({ email: null });
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup({ parentId, method: "paystack_card", amount: 100_00 }, recep);
    expect(res.statusCode).toBe(422);
  });

  // --- bank_transfer routed elsewhere -------------------------------------

  it("bank_transfer → 422 (admin-confirmed flow, not credited here)", async () => {
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup({ parentId, method: "bank_transfer", amount: 100_00 }, recep);
    expect(res.statusCode).toBe(422);
  });

  // --- RBAC + auth (AC1) ---------------------------------------------------

  it("cashier is allowed → 201 (AC1)", async () => {
    const { parentId } = await seedParent();
    const cashier = await loginStaff("0712000002", "7422");
    const res = await doTopup({ parentId, method: "cash", amount: 10_000 }, cashier);
    expect(res.statusCode).toBe(201);
  });

  it("packer (no create payment) → 403 (AC1)", async () => {
    const { parentId } = await seedParent();
    const packer = await loginStaff("0712000003", "7423");
    const res = await doTopup({ parentId, method: "cash", amount: 10_000 }, packer);
    expect(res.statusCode).toBe(403);
  });

  it("accountant (read-only) → 403 (AC1)", async () => {
    const { parentId } = await seedParent();
    const acct = await loginStaff("0712000004", "7424");
    const res = await doTopup({ parentId, method: "cash", amount: 10_000 }, acct);
    expect(res.statusCode).toBe(403);
  });

  it("unauthenticated → 401", async () => {
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup({ parentId, method: "cash", amount: 10_000 }, recep, { auth: false });
    expect(res.statusCode).toBe(401);
  });

  it("missing CSRF → 403", async () => {
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup({ parentId, method: "cash", amount: 10_000 }, recep, { csrf: false });
    expect(res.statusCode).toBe(403);
  });

  // --- validation + dispatch guards ---------------------------------------

  it("unknown method → 400", async () => {
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup({ parentId, method: "crypto", amount: 10_000 }, recep);
    expect(res.statusCode).toBe(400);
  });

  it("non-integer amount → 400", async () => {
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup({ parentId, method: "cash", amount: 12.5 }, recep);
    expect(res.statusCode).toBe(400);
  });

  it("unknown parent → 404", async () => {
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup(
      { parentId: "00000000-0000-0000-0000-000000000000", method: "cash", amount: 10_000 },
      recep,
    );
    expect(res.statusCode).toBe(404);
  });

  it("mpesa_stk when provider not wired → 503", async () => {
    app = build({ mpesaOk: false });
    const { parentId } = await seedParent();
    const recep = await loginStaff("0712000001", "7421");
    const res = await doTopup({ parentId, method: "mpesa_stk", amount: 100_00 }, recep);
    expect(res.statusCode).toBe(503);
  });
});
