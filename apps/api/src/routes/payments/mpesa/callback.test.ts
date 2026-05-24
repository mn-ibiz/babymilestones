import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  auditOutbox,
  mpesaCallbacks,
  mpesaStkRequests,
  users,
  walletLedger,
  wallets,
} from "@bm/db";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import { balance } from "@bm/wallet";
import type { DarajaTransport } from "@bm/payments";
import { buildApp } from "../../../app.js";
import { parseStkCallback } from "./callback.js";

/**
 * P1-E04-S02 — M-Pesa C2B/STK callback handler (idempotent). Integration via
 * app.inject. The IP allowlist is disabled (`mpesaCallback: { allowlist: [] }`)
 * because app.inject has no real Daraja client IP. Covers: happy credit (AC3),
 * replay 5× → exactly one ledger entry (AC2/idempotency), failure → FAILED +
 * audit (AC4), out-of-order arrival (AC5), malformed body, and always-200 (AC6).
 */
const config = {
  baseUrl: "https://sandbox.safaricom.co.ke",
  consumerKey: "ck",
  consumerSecret: "cs",
  shortcode: "174379",
  passkey: "pk",
  callbackUrl: "https://api.babymilestones.co.ke/payments/mpesa/callback",
} as const;

const transport: DarajaTransport = async () =>
  new Response(JSON.stringify({ access_token: "tok" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const CHECKOUT = "ws_CO_callback_1";

function callbackBody(
  resultCode: number,
  checkoutRequestId = CHECKOUT,
): Record<string, unknown> {
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: "mr-1",
        CheckoutRequestID: checkoutRequestId,
        ResultCode: resultCode,
        ResultDesc: resultCode === 0 ? "The service request is processed successfully." : "Cancelled by user",
      },
    },
  };
}

describe("POST /payments/mpesa/callback (P1-E04-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let userId: string;
  let walletId: string;

  const post = (body: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/payments/mpesa/callback", payload: body });

  /** Seed an STK_SENT request (as S01's initiate would have left it). */
  async function seedRequest(amountKes = 500, checkoutRequestId = CHECKOUT) {
    await dbh.db.insert(mpesaStkRequests).values({
      checkoutRequestId,
      merchantRequestId: "mr-1",
      parentId: userId,
      walletId,
      amount: amountKes,
      phone: "+254712345678",
      state: "STK_SENT",
    });
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({
      db: dbh.db,
      sessions: new InMemorySessionStore(),
      mpesa: { config, transport },
      mpesaCallback: { allowlist: [] },
    });
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712345678", pinHash: await hashPin("1357") })
      .returning();
    userId = u!.id;
    const [w] = await dbh.db.insert(wallets).values({ userId }).returning();
    walletId = w!.id;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("parseStkCallback rejects malformed bodies and reads valid ones", () => {
    expect(parseStkCallback(null)).toBeNull();
    expect(parseStkCallback({})).toBeNull();
    expect(parseStkCallback({ Body: {} })).toBeNull();
    expect(parseStkCallback({ Body: { stkCallback: { ResultCode: 0 } } })).toBeNull();
    const ok = parseStkCallback(callbackBody(0));
    expect(ok).toMatchObject({ checkoutRequestId: CHECKOUT, resultCode: 0 });
  });

  it("AC2/AC3: happy path persists a callback row and credits the wallet once", async () => {
    await seedRequest(500);
    const res = await post(callbackBody(0));
    expect(res.statusCode).toBe(200);

    const cbRows = await dbh.db.select().from(mpesaCallbacks);
    expect(cbRows).toHaveLength(1);
    expect(cbRows[0]!.checkoutRequestId).toBe(CHECKOUT);
    expect(cbRows[0]!.resultCode).toBe(0);

    // Wallet credited 500 KES = 50_000 cents.
    expect(await balance(dbh.db, walletId)).toBe(50_000);

    // The credit's idempotency key is the mpesa_callback row id (AC3).
    const [credit] = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.kind, "topup"));
    expect(credit!.idempotencyKey).toBe(cbRows[0]!.id);

    // Request advanced to SUCCEEDED.
    const [reqRow] = await dbh.db
      .select()
      .from(mpesaStkRequests)
      .where(eq(mpesaStkRequests.checkoutRequestId, CHECKOUT));
    expect(reqRow!.state).toBe("SUCCEEDED");
  });

  it("AC2: replaying the same callback 5× yields exactly one ledger credit", async () => {
    await seedRequest(500);
    for (let i = 0; i < 5; i++) {
      const res = await post(callbackBody(0));
      expect(res.statusCode).toBe(200);
    }
    const cbRows = await dbh.db.select().from(mpesaCallbacks);
    expect(cbRows).toHaveLength(1);

    const credits = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.kind, "topup"));
    expect(credits).toHaveLength(1);
    expect(await balance(dbh.db, walletId)).toBe(50_000);
  });

  it("AC4: failure result marks the request FAILED, audits, and credits nothing", async () => {
    await seedRequest(500);
    const res = await post(callbackBody(1032));
    expect(res.statusCode).toBe(200);

    const [reqRow] = await dbh.db
      .select()
      .from(mpesaStkRequests)
      .where(eq(mpesaStkRequests.checkoutRequestId, CHECKOUT));
    expect(reqRow!.state).toBe("FAILED");

    expect(await balance(dbh.db, walletId)).toBe(0);

    const audits = await dbh.db.select().from(auditOutbox);
    expect(audits.some((a) => a.action === "payment.mpesa.callback.failed")).toBe(true);
  });

  it("AC5: out-of-order callback (no request yet) is recorded, returns 200, credits nothing", async () => {
    // No seedRequest — callback arrives before the request row commits.
    const res = await post(callbackBody(0));
    expect(res.statusCode).toBe(200);

    const cbRows = await dbh.db.select().from(mpesaCallbacks);
    expect(cbRows).toHaveLength(1);
    expect(await balance(dbh.db, walletId)).toBe(0);

    const audits = await dbh.db.select().from(auditOutbox);
    expect(audits.some((a) => a.action === "payment.mpesa.callback.orphan")).toBe(true);
  });

  it("AC6: a malformed body still returns HTTP 200 and records nothing", async () => {
    const res = await post({ garbage: true });
    expect(res.statusCode).toBe(200);
    const cbRows = await dbh.db.select().from(mpesaCallbacks);
    expect(cbRows).toHaveLength(0);
  });

  it("AC6: an unparseable JSON-ish body returns 200 (Daraja never retries)", async () => {
    const res = await post(callbackBody(0, "")); // empty checkout id → unparseable
    expect(res.statusCode).toBe(200);
    const cbRows = await dbh.db.select().from(mpesaCallbacks);
    expect(cbRows).toHaveLength(0);
  });

  it("blocks a callback from an IP outside the allowlist (still 200, records nothing)", async () => {
    await app.close();
    app = buildApp({
      db: dbh.db,
      sessions: new InMemorySessionStore(),
      mpesa: { config, transport },
      mpesaCallback: { allowlist: ["196.201.214.200"] },
    });
    await seedRequest(500);
    const res = await post(callbackBody(0)); // inject IP is 127.0.0.1
    expect(res.statusCode).toBe(200);
    const cbRows = await dbh.db.select().from(mpesaCallbacks);
    expect(cbRows).toHaveLength(0);
    expect(await balance(dbh.db, walletId)).toBe(0);
  });
});
