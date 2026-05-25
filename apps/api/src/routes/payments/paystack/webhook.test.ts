import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  auditOutbox,
  paystackEvents,
  paystackTransactions,
  users,
  walletLedger,
  wallets,
} from "@bm/db";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import { balance } from "@bm/wallet";
import type { PaystackTransport } from "@bm/payments";
import { buildApp } from "../../../app.js";
import { parsePaystackEvent } from "./webhook.js";

/**
 * P1-E04-S05 — Paystack webhook (signature + replay protection). Integration via
 * app.inject. Covers AC1 (valid signature credits once), AC2 (tampered/invalid →
 * 401, no writes), AC3 (replay 5× → exactly one ledger entry), AC4 (charge.success
 * → wallet.post keyed by event id).
 */
const SECRET = "sk_test_webhook_secret";

const config = {
  baseUrl: "https://api.paystack.co",
  secretKey: SECRET,
  callbackUrl: "https://api.babymilestones.co.ke/payments/paystack/verify",
} as const;

// The webhook never calls Paystack; transport is unused here but required by config.
const transport: PaystackTransport = async () =>
  new Response(JSON.stringify({ status: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function sign(rawBody: string, secret = SECRET): string {
  return createHmac("sha512", secret).update(rawBody).digest("hex");
}

function chargeSuccess(reference: string, eventId = 998877): Record<string, unknown> {
  return {
    event: "charge.success",
    data: {
      id: eventId,
      reference,
      status: "success",
      amount: 50_000,
      currency: "KES",
    },
  };
}

describe("POST /webhooks/paystack (P1-E04-S05)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let userId: string;
  let walletId: string;
  let reference: string;

  /** Seed an INITIALIZED paystack_transaction (as S04's init would have left it). */
  async function seedTxn(amountMinor = 50_000): Promise<string> {
    const ref = randomUUID();
    await dbh.db.insert(paystackTransactions).values({
      reference: ref,
      parentId: userId,
      walletId,
      amount: amountMinor,
      email: "parent@example.com",
      state: "INITIALIZED",
    });
    return ref;
  }

  /** POST a signed webhook with a correct signature over the raw JSON body. */
  function postSigned(body: Record<string, unknown>, secret = SECRET) {
    const payload = JSON.stringify(body);
    return app.inject({
      method: "POST",
      url: "/webhooks/paystack",
      headers: { "content-type": "application/json", "x-paystack-signature": sign(payload, secret) },
      payload,
    });
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({
      db: dbh.db,
      sessions: new InMemorySessionStore(),
      paystack: { config, transport },
    });
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712345678", pinHash: await hashPin("1357") })
      .returning();
    userId = u!.id;
    const [w] = await dbh.db.insert(wallets).values({ userId }).returning();
    walletId = w!.id;
    reference = await seedTxn(50_000);
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("parsePaystackEvent rejects malformed bodies and reads valid ones", () => {
    expect(parsePaystackEvent(null)).toBeNull();
    expect(parsePaystackEvent({})).toBeNull();
    expect(parsePaystackEvent({ event: "charge.success" })).toBeNull();
    expect(parsePaystackEvent({ event: "charge.success", data: {} })).toBeNull();
    const ok = parsePaystackEvent(chargeSuccess("ref-1", 5));
    expect(ok).toMatchObject({ id: "5", event: "charge.success", reference: "ref-1" });
  });

  it("AC1/AC4: a validly-signed charge.success credits the wallet once, keyed by event id", async () => {
    const res = await postSigned(chargeSuccess(reference, 111));
    expect(res.statusCode).toBe(200);

    const events = await dbh.db.select().from(paystackEvents);
    expect(events).toHaveLength(1);
    expect(events[0]!.id).toBe("111");
    expect(events[0]!.event).toBe("charge.success");

    // Wallet credited the amount from OUR transaction row (50_000 cents).
    expect(await balance(dbh.db, walletId)).toBe(50_000);

    // AC4: the credit's idempotency key is the Paystack event id.
    const [credit] = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.kind, "topup"));
    expect(credit!.idempotencyKey).toBe("111");
    expect(credit!.source).toBe("paystack");

    // Transaction advanced to SUCCEEDED.
    const [txn] = await dbh.db
      .select()
      .from(paystackTransactions)
      .where(eq(paystackTransactions.reference, reference));
    expect(txn!.state).toBe("SUCCEEDED");

    const audits = await dbh.db.select().from(auditOutbox);
    expect(audits.some((a) => a.action === "payment.paystack.webhook.credited")).toBe(true);
  });

  it("AC3: replaying the same event 5× yields exactly one ledger credit", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await postSigned(chargeSuccess(reference, 222));
      expect(res.statusCode).toBe(200);
    }
    const events = await dbh.db.select().from(paystackEvents);
    expect(events).toHaveLength(1);

    const credits = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.kind, "topup"));
    expect(credits).toHaveLength(1);
    expect(await balance(dbh.db, walletId)).toBe(50_000);
  });

  it("AC2: a tampered body (signature no longer matches) → 401 and zero writes", async () => {
    const body = chargeSuccess(reference, 333);
    const payload = JSON.stringify(body);
    const goodSig = sign(payload);
    // Tamper the body AFTER signing so the HMAC no longer matches.
    const tampered = payload.replace("50000", "9999999");
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/paystack",
      headers: { "content-type": "application/json", "x-paystack-signature": goodSig },
      payload: tampered,
    });
    expect(res.statusCode).toBe(401);

    expect(await dbh.db.select().from(paystackEvents)).toHaveLength(0);
    expect(await dbh.db.select().from(walletLedger)).toHaveLength(0);
    expect(await balance(dbh.db, walletId)).toBe(0);
  });

  it("AC2: a signature made with the wrong secret → 401 and zero writes", async () => {
    const res = await postSigned(chargeSuccess(reference, 444), "wrong_secret");
    expect(res.statusCode).toBe(401);
    expect(await dbh.db.select().from(paystackEvents)).toHaveLength(0);
    expect(await balance(dbh.db, walletId)).toBe(0);
  });

  it("AC2: a missing signature header → 401 and zero writes", async () => {
    const payload = JSON.stringify(chargeSuccess(reference, 555));
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/paystack",
      headers: { "content-type": "application/json" },
      payload,
    });
    expect(res.statusCode).toBe(401);
    expect(await dbh.db.select().from(paystackEvents)).toHaveLength(0);
  });

  it("a validly-signed non-charge.success event is recorded but credits nothing", async () => {
    const res = await postSigned({
      event: "charge.failed",
      data: { id: 666, reference, status: "failed" },
    });
    expect(res.statusCode).toBe(200);

    const events = await dbh.db.select().from(paystackEvents);
    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe("charge.failed");
    expect(await balance(dbh.db, walletId)).toBe(0);
  });

  it("a charge.success for an unknown reference is recorded, audited, credits nothing", async () => {
    const res = await postSigned(chargeSuccess(randomUUID(), 777));
    expect(res.statusCode).toBe(200);
    expect(await balance(dbh.db, walletId)).toBe(0);
    const audits = await dbh.db.select().from(auditOutbox);
    expect(audits.some((a) => a.action === "payment.paystack.webhook.orphan")).toBe(true);
  });

  it("a validly-signed but unrecognised shape returns 200 and writes nothing", async () => {
    const res = await postSigned({ hello: "world" });
    expect(res.statusCode).toBe(200);
    expect(await dbh.db.select().from(paystackEvents)).toHaveLength(0);
  });
});
