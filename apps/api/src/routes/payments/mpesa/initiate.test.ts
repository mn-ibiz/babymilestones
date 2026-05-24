import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, mpesaStkRequests, users, wallets } from "@bm/db";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import { buildApp } from "../../../app.js";
import type { DarajaTransport } from "@bm/payments";

/**
 * P1-E04-S01 — M-Pesa STK push initiation route. Integration via app.inject with
 * a real parent session (+ CSRF). The Daraja transport is injected/mocked so no
 * real network is hit. Covers persistence of mpesa_stk_request (AC2), the audit
 * write (AC5), validation (AC1), and the status polling endpoint (AC4).
 */
const config = {
  baseUrl: "https://sandbox.safaricom.co.ke",
  consumerKey: "ck",
  consumerSecret: "cs",
  shortcode: "174379",
  passkey: "pk",
  callbackUrl: "https://api.babymilestones.co.ke/payments/mpesa/callback",
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

describe("POST /payments/mpesa/stk (P1-E04-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let sessionCookie: string;
  let csrfCookie: string;
  let csrfToken: string;
  let userId: string;
  let walletId: string;

  const build = (transport: DarajaTransport = darajaTransport()) =>
    buildApp({ db: dbh.db, sessions, mpesa: { config, transport } });

  const login = async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { phone: "0712345678", pin: "1357" },
    });
    const cookies = res.headers["set-cookie"] as string[];
    sessionCookie = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    csrfToken = res.json().csrfToken as string;
  };

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = build();
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712345678", pinHash: await hashPin("1357") })
      .returning();
    userId = u!.id;
    const [w] = await dbh.db.insert(wallets).values({ userId }).returning();
    walletId = w!.id;
    await login();
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const initiate = (
    body: Record<string, unknown>,
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(sessionCookie);
    if (csrf) cookieParts.push(csrfCookie);
    const headers: Record<string, string> = {};
    if (cookieParts.length) headers["cookie"] = cookieParts.join("; ");
    if (csrf) headers["x-csrf-token"] = csrfToken;
    return app.inject({ method: "POST", url: "/payments/mpesa/stk", headers, payload: body });
  };

  it("rejects an unauthenticated initiation", async () => {
    const res = await initiate({ amountKes: 500 }, { auth: false, csrf: false });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an initiation without a CSRF token", async () => {
    const res = await initiate({ amountKes: 500 }, { csrf: false });
    expect(res.statusCode).toBe(403);
  });

  it("AC1: rejects an amount below the minimum", async () => {
    const res = await initiate({ amountKes: 10 });
    expect(res.statusCode).toBe(400);
  });

  it("AC1: rejects an amount above the maximum", async () => {
    const res = await initiate({ amountKes: 80_000 });
    expect(res.statusCode).toBe(400);
  });

  it("AC2/AC3: initiates, persists mpesa_stk_request keyed by CheckoutRequestID, state STK_SENT", async () => {
    const res = await initiate({ amountKes: 500 });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ checkoutRequestId: "ws_CO_123", state: "STK_SENT" });

    const [row] = await dbh.db
      .select()
      .from(mpesaStkRequests)
      .where(eq(mpesaStkRequests.checkoutRequestId, "ws_CO_123"));
    expect(row).toBeTruthy();
    expect(row!.parentId).toBe(userId);
    expect(row!.walletId).toBe(walletId);
    expect(row!.amount).toBe(500);
    expect(row!.merchantRequestId).toBe("mr-1");
    expect(row!.state).toBe("STK_SENT");
  });

  it("AC5: writes an audit_outbox row for the initiation", async () => {
    await initiate({ amountKes: 500 });
    const rows = await dbh.db.select().from(auditOutbox);
    const ev = rows.find((r) => r.action === "payment.mpesa.stk.initiate");
    expect(ev).toBeTruthy();
    expect(ev!.actorUserId).toBe(userId);
  });

  it("502 + no row persisted when Daraja rejects the push (non-zero ResponseCode)", async () => {
    app = build(
      darajaTransport({
        MerchantRequestID: "mr-2",
        CheckoutRequestID: "ws_CO_fail",
        ResponseCode: "1",
        ResponseDescription: "Unable to lock subscriber",
      }),
    );
    await login();
    const res = await initiate({ amountKes: 500 });
    expect(res.statusCode).toBe(502);
    const rows = await dbh.db.select().from(mpesaStkRequests);
    expect(rows).toHaveLength(0);
  });

  it("AC4: status endpoint returns the current state for the parent's request", async () => {
    await initiate({ amountKes: 500 });
    const res = await app.inject({
      method: "GET",
      url: "/payments/mpesa/stk/ws_CO_123",
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ checkoutRequestId: "ws_CO_123", state: "STK_SENT" });
  });

  it("AC4: status endpoint 404s another parent's request (ownership scoped)", async () => {
    await initiate({ amountKes: 500 });
    // A second parent logs in and tries to read the first parent's checkout.
    const [u2] = await dbh.db
      .insert(users)
      .values({ phone: "+254712999999", pinHash: await hashPin("2468") })
      .returning();
    await dbh.db.insert(wallets).values({ userId: u2!.id });
    const login2 = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { phone: "0712999999", pin: "2468" },
    });
    const cookies = login2.headers["set-cookie"] as string[];
    const otherSession = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const res = await app.inject({
      method: "GET",
      url: "/payments/mpesa/stk/ws_CO_123",
      headers: { cookie: otherSession },
    });
    expect(res.statusCode).toBe(404);
  });
});
