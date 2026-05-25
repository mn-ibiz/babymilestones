import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, parents, paystackTransactions, users, wallets } from "@bm/db";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import { buildApp } from "../../../app.js";
import type { PaystackTransport } from "@bm/payments";

/**
 * P1-E04-S04 — Paystack card top-up. Integration via app.inject with a real
 * parent session (+ CSRF). The Paystack transport is injected/mocked so no real
 * network is hit. Covers init persistence (AC1), the audit write, validation,
 * the card-on-file opt-in (AC4), and the redirect-back verify endpoint (AC2/AC3).
 */
const config = {
  baseUrl: "https://api.paystack.co",
  secretKey: "sk_test_abc",
  callbackUrl: "https://app.babymilestones.co.ke/top-up/paystack/return",
} as const;

function paystackTransport(
  responses: { init?: unknown; verify?: unknown } = {},
): { transport: PaystackTransport; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const initBody = responses.init ?? {
    status: true,
    data: {
      authorization_url: "https://checkout.paystack.com/abc123",
      access_code: "ac_abc123",
      reference: "echoed",
    },
  };
  const verifyBody = responses.verify ?? {
    status: true,
    data: {
      status: "success",
      amount: 50_000,
      authorization: { authorization_code: "AUTH_xyz", reusable: true, last4: "4081", card_type: "visa" },
    },
  };
  const transport: PaystackTransport = async (url, init) => {
    calls.push({ url, init });
    const body = url.includes("/transaction/verify/") ? verifyBody : initBody;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { transport, calls };
}

describe("POST /payments/paystack/init (P1-E04-S04)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let sessionCookie: string;
  let csrfCookie: string;
  let csrfToken: string;
  let userId: string;
  let walletId: string;
  let transport: PaystackTransport;
  let calls: { url: string; init: RequestInit }[];

  const build = () => buildApp({ db: dbh.db, sessions, paystack: { config, transport } });

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
    ({ transport, calls } = paystackTransport());
    app = build();
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712345678", pinHash: await hashPin("1357") })
      .returning();
    userId = u!.id;
    await dbh.db
      .insert(parents)
      .values({ userId, firstName: "Amina", lastName: "Otieno", email: "amina@example.com" });
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
    return app.inject({ method: "POST", url: "/payments/paystack/init", headers, payload: body });
  };

  it("rejects an unauthenticated initiation", async () => {
    const res = await initiate({ amountKes: 500 }, { auth: false, csrf: false });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an initiation without a CSRF token", async () => {
    const res = await initiate({ amountKes: 500 }, { csrf: false });
    expect(res.statusCode).toBe(403);
  });

  it("AC1: rejects an out-of-bounds amount", async () => {
    expect((await initiate({ amountKes: 10 })).statusCode).toBe(400);
    expect((await initiate({ amountKes: 12.5 })).statusCode).toBe(400);
  });

  it("AC1: initiates, returns the hosted-checkout URL + reference (UUID), persists INITIALIZED", async () => {
    const res = await initiate({ amountKes: 500 });
    expect(res.statusCode).toBe(202);
    const json = res.json() as { reference: string; authorizationUrl: string; state: string };
    expect(json.authorizationUrl).toBe("https://checkout.paystack.com/abc123");
    expect(json.state).toBe("INITIALIZED");
    // Reference is a UUID generated server-side.
    expect(json.reference).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );

    const [row] = await dbh.db
      .select()
      .from(paystackTransactions)
      .where(eq(paystackTransactions.reference, json.reference));
    expect(row).toBeTruthy();
    expect(row!.parentId).toBe(userId);
    expect(row!.walletId).toBe(walletId);
    expect(row!.amount).toBe(50_000); // minor units
    expect(row!.email).toBe("amina@example.com");
    expect(row!.state).toBe("INITIALIZED");
    expect(row!.saveCard).toBe(false);

    // The amount sent to Paystack is in minor units and email from the profile.
    const initCall = calls.find((c) => c.url.endsWith("/transaction/initialize"))!;
    const sent = JSON.parse(String(initCall.init.body)) as Record<string, unknown>;
    expect(sent.amount).toBe(50_000);
    expect(sent.email).toBe("amina@example.com");
    expect(sent.reference).toBe(json.reference);
  });

  it("AC4: card-on-file opt-in persists save_card", async () => {
    const res = await initiate({ amountKes: 500, saveCard: true });
    const json = res.json() as { reference: string };
    const [row] = await dbh.db
      .select()
      .from(paystackTransactions)
      .where(eq(paystackTransactions.reference, json.reference));
    expect(row!.saveCard).toBe(true);
  });

  it("writes an audit_outbox row for the initiation", async () => {
    await initiate({ amountKes: 500 });
    const rows = await dbh.db.select().from(auditOutbox);
    const ev = rows.find((r) => r.action === "payment.paystack.init");
    expect(ev).toBeTruthy();
    expect(ev!.actorUserId).toBe(userId);
  });

  it("422 when the parent has no email on file (Paystack requires one)", async () => {
    await dbh.db.update(parents).set({ email: null }).where(eq(parents.userId, userId));
    const res = await initiate({ amountKes: 500 });
    expect(res.statusCode).toBe(422);
    expect(await dbh.db.select().from(paystackTransactions)).toHaveLength(0);
  });

  it("502 + no row persisted when Paystack rejects the init", async () => {
    ({ transport, calls } = paystackTransport({ init: { status: false, message: "Invalid key" } }));
    app = build();
    await login();
    const res = await initiate({ amountKes: 500 });
    expect(res.statusCode).toBe(502);
    expect(await dbh.db.select().from(paystackTransactions)).toHaveLength(0);
  });

  describe("GET /payments/paystack/verify/:reference (AC2/AC3)", () => {
    it("verifies on redirect-back, advances state to SUCCEEDED, captures card-on-file authorization", async () => {
      const init = await initiate({ amountKes: 500, saveCard: true });
      const { reference } = init.json() as { reference: string };

      const res = await app.inject({
        method: "GET",
        url: `/payments/paystack/verify/${reference}`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ reference, state: "SUCCEEDED" });

      const [row] = await dbh.db
        .select()
        .from(paystackTransactions)
        .where(eq(paystackTransactions.reference, reference));
      expect(row!.state).toBe("SUCCEEDED");
      // AC4: a reusable authorization is captured when the parent opted in.
      expect(row!.authorizationCode).toBe("AUTH_xyz");
    });

    it("does not capture an authorization when the parent did not opt in", async () => {
      const init = await initiate({ amountKes: 500 });
      const { reference } = init.json() as { reference: string };
      await app.inject({
        method: "GET",
        url: `/payments/paystack/verify/${reference}`,
        headers: { cookie: sessionCookie },
      });
      const [row] = await dbh.db
        .select()
        .from(paystackTransactions)
        .where(eq(paystackTransactions.reference, reference));
      expect(row!.authorizationCode).toBeNull();
    });

    it("404s another parent's reference (ownership scoped)", async () => {
      const init = await initiate({ amountKes: 500 });
      const { reference } = init.json() as { reference: string };

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
        url: `/payments/paystack/verify/${reference}`,
        headers: { cookie: otherSession },
      });
      expect(res.statusCode).toBe(404);
    });

    it("maps a failed verify to FAILED (webhook remains source of truth for credit)", async () => {
      ({ transport, calls } = paystackTransport({
        verify: { status: true, data: { status: "failed" } },
      }));
      app = build();
      await login();
      const init = await initiate({ amountKes: 500 });
      const { reference } = init.json() as { reference: string };
      const res = await app.inject({
        method: "GET",
        url: `/payments/paystack/verify/${reference}`,
        headers: { cookie: sessionCookie },
      });
      expect(res.json()).toMatchObject({ state: "FAILED" });
    });
  });
});
