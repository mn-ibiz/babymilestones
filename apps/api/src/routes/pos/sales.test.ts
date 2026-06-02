import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, parents, posSales, products, receipts, smsOutbox, users, wallets, wcOutbox } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { createProduct } from "@bm/catalog";
import { post } from "@bm/wallet";
import { buildApp } from "../../app.js";
import type { DarajaTransport, PaystackTransport } from "@bm/payments";

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
  secretKey: "sk_test_abc",
  callbackUrl: "https://app.babymilestones.co.ke/pos",
} as const;

/** Daraja transport: token, STK push success, and STK query success. */
const darajaTransport: DarajaTransport = async (url) => {
  if (url.includes("/oauth/")) {
    return new Response(JSON.stringify({ access_token: "tok", expires_in: "3599" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (url.includes("query")) {
    return new Response(
      JSON.stringify({ ResponseCode: "0", ResultCode: "0", ResultDesc: "Processed successfully." }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(
    JSON.stringify({ MerchantRequestID: "mr-1", CheckoutRequestID: "ws_CO_1", ResponseCode: "0", ResponseDescription: "Success" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

/**
 * Paystack transport: init returns a hosted-checkout URL and captures the amount;
 * verify echoes that captured amount back as "success" (so it matches the sale
 * total — the route settles only on an amount match).
 */
let paystackLastAmount = 0;
const paystackTransport: PaystackTransport = async (url, init) => {
  if (url.includes("/transaction/verify/")) {
    const body = { status: true, data: { status: "success", amount: paystackLastAmount, authorization: null } };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }
  const reqBody = JSON.parse(String(init?.body ?? "{}")) as { amount?: number; reference?: string };
  paystackLastAmount = reqBody.amount ?? 0;
  const body = {
    status: true,
    data: { authorization_url: "https://checkout.paystack.com/pos1", access_code: "ac_1", reference: reqBody.reference },
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
};

describe("POS sales — payment at POS (P2-E04-S04)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const build = (opts: { mpesa?: boolean; paystack?: boolean } = {}) =>
    buildApp({
      db: dbh.db,
      sessions,
      ...(opts.mpesa ? { mpesa: { config: mpesaConfig, transport: darajaTransport } } : {}),
      ...(opts.paystack ? { paystack: { config: paystackConfig, transport: paystackTransport } } : {}),
    });

  async function login(phone: string, pin: string) {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrf = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { cookie: `${session}; ${csrf}`, csrfToken: res.json().csrfToken as string };
  }

  async function seedProduct(over: Parameters<typeof createProduct>[1]) {
    return createProduct(dbh.db, over);
  }

  const sale = (
    creds: { cookie: string; csrfToken: string },
    payload: Record<string, unknown>,
  ) =>
    app.inject({
      method: "POST",
      url: "/pos/sales",
      headers: { cookie: creds.cookie, "x-csrf-token": creds.csrfToken },
      payload,
    });

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = build();
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "cashier"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "packer"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("forbids a packer (no create-payment permission)", async () => {
    const p = await seedProduct({ sku: "P1", name: "Widget", priceCents: 1000, stockQty: 5 });
    const creds = await login("+254712000003", "7423");
    const res = await sale(creds, { method: "cash", lines: [{ productId: p.id, qty: 1 }], cashTenderedCents: 1000 });
    expect(res.statusCode).toBe(403);
  });

  describe("cash (AC2/AC6)", () => {
    it("settles, computes change, writes a receipt, decrements stock, audits", async () => {
      const p = await seedProduct({ sku: "P1", name: "Widget", priceCents: 1000, stockQty: 5 });
      const creds = await login("+254712000002", "7422");
      const res = await sale(creds, {
        method: "cash",
        lines: [{ productId: p.id, qty: 2 }],
        cashTenderedCents: 2500,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("paid");
      expect(body.totalCents).toBe(2000);
      expect(body.changeCents).toBe(500);
      expect(body.drawerMessage).toMatch(/change KES 5\.00/u);
      expect(body.receiptNumber).toMatch(/^POS-2026-/u);

      // stock decremented 5 → 3
      const [prod] = await dbh.db.select().from(products).where(eq(products.id, p.id));
      expect(prod!.stockQty).toBe(3);
      // a receipt exists with the right total
      const recs = await dbh.db.select().from(receipts);
      expect(recs).toHaveLength(1);
      expect(recs[0]!.total).toBe(2000);
      // sale row paid
      const [s] = await dbh.db.select().from(posSales);
      expect(s!.status).toBe("paid");
      expect(s!.receiptId).toBe(recs[0]!.id);
      // audited
      const events = await dbh.db.select().from(auditOutbox);
      expect(events.some((e) => e.action === "pos.sale.paid")).toBe(true);
    });

    it("enqueues a Woo stock push with the new value for a mapped product (Story 29.5 AC1)", async () => {
      const mapped = await seedProduct({ sku: "WOO-1", name: "Online toy", priceCents: 1000, stockQty: 5 });
      await dbh.db.update(products).set({ wooProductId: 7777 }).where(eq(products.id, mapped.id));
      const creds = await login("+254712000002", "7422");
      const res = await sale(creds, {
        method: "cash",
        lines: [{ productId: mapped.id, qty: 1 }],
        cashTenderedCents: 1000,
      });
      expect(res.statusCode).toBe(200);
      // local stock decremented 5 → 4
      const [prod] = await dbh.db.select().from(products).where(eq(products.id, mapped.id));
      expect(prod!.stockQty).toBe(4);
      // ONE pending stock_push outbox row carrying the new value + derived status
      const pushes = await dbh.db.select().from(wcOutbox).where(eq(wcOutbox.kind, "stock_push"));
      expect(pushes).toHaveLength(1);
      expect(pushes[0]!.request).toMatchObject({ wooProductId: 7777, stockQuantity: 4, stockStatus: "instock" });
    });

    it("does NOT enqueue a push for an unmapped (in-store only) product (Story 29.5 AC2)", async () => {
      const instore = await seedProduct({ sku: "LOCAL-1", name: "Shelf only", priceCents: 1000, stockQty: 5 });
      const creds = await login("+254712000002", "7422");
      await sale(creds, { method: "cash", lines: [{ productId: instore.id, qty: 1 }], cashTenderedCents: 1000 });
      const pushes = await dbh.db.select().from(wcOutbox).where(eq(wcOutbox.kind, "stock_push"));
      expect(pushes).toHaveLength(0);
    });

    it("is idempotent on a replayed create — one charge, one stock decrement (AC7/robustness)", async () => {
      const p = await seedProduct({ sku: "IDEM", name: "Once", priceCents: 1000, stockQty: 5 });
      const creds = await login("+254712000002", "7422");
      const key = "11111111-1111-4111-8111-111111111111";
      const body = { method: "cash", lines: [{ productId: p.id, qty: 2 }], cashTenderedCents: 2000, idempotencyKey: key };
      const first = await sale(creds, body);
      const second = await sale(creds, body);
      expect(first.json().saleId).toBe(second.json().saleId);
      const [prod] = await dbh.db.select().from(products).where(eq(products.id, p.id));
      expect(prod!.stockQty).toBe(3); // decremented once, not twice
      expect(await dbh.db.select().from(posSales)).toHaveLength(1);
    });

    it("rejects a sale that lists the same product twice (use quantity)", async () => {
      const p = await seedProduct({ sku: "DUP", name: "Dup", priceCents: 1000, stockQty: 5 });
      const creds = await login("+254712000002", "7422");
      const res = await sale(creds, {
        method: "cash",
        lines: [{ productId: p.id, qty: 1 }, { productId: p.id, qty: 1 }],
        cashTenderedCents: 5000,
      });
      expect(res.statusCode).toBe(400);
    });

    it("blocks when cash tendered is less than the total (AC7)", async () => {
      const p = await seedProduct({ sku: "P2", name: "Pricey", priceCents: 5000, stockQty: 5 });
      const creds = await login("+254712000002", "7422");
      const res = await sale(creds, { method: "cash", lines: [{ productId: p.id, qty: 1 }], cashTenderedCents: 1000 });
      expect(res.statusCode).toBe(400);
    });

    it("blocks the sale when stock is insufficient (AC: stock check)", async () => {
      const p = await seedProduct({ sku: "P3", name: "Scarce", priceCents: 1000, stockQty: 1 });
      const creds = await login("+254712000002", "7422");
      const res = await sale(creds, { method: "cash", lines: [{ productId: p.id, qty: 3 }], cashTenderedCents: 5000 });
      expect(res.statusCode).toBe(409);
      expect(res.json().violations[0]).toMatchObject({ available: 1, requested: 3 });
    });

    it("sends a receipt SMS when a customer phone is given (AC6)", async () => {
      const p = await seedProduct({ sku: "P4", name: "Item", priceCents: 1000, stockQty: 5 });
      const creds = await login("+254712000002", "7422");
      await sale(creds, { method: "cash", lines: [{ productId: p.id, qty: 1 }], cashTenderedCents: 1000, customerPhone: "0722333444" });
      const sms = await dbh.db.select().from(smsOutbox);
      expect(sms).toHaveLength(1);
      expect(sms[0]!.phone).toBe("+254722333444");
    });
  });

  describe("wallet (AC5)", () => {
    async function seedParentWallet(phone: string, creditCents: number) {
      const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x", role: "parent" }).returning();
      const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
      await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Ann", lastName: "M" });
      if (creditCents > 0) {
        await post(dbh.db, {
          walletId: w!.id,
          amount: creditCents,
          kind: "topup",
          idempotencyKey: `seed-${u!.id}`,
          source: "seed",
          postedBy: u!.id,
        });
      }
      return { walletId: w!.id };
    }

    it("debits a parent wallet and settles (AC5/AC6)", async () => {
      const p = await seedProduct({ sku: "W1", name: "Toy", priceCents: 1500, stockQty: 4 });
      const { walletId } = await seedParentWallet("+254733111222", 5000);
      const creds = await login("+254712000002", "7422");
      const res = await sale(creds, { method: "wallet", lines: [{ productId: p.id, qty: 2 }], customerPhone: "0733111222" });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("paid");
      // wallet debited by 3000 (5000 → 2000)
      const { balance } = await import("@bm/wallet");
      expect(await balance(dbh.db, walletId)).toBe(2000);
    });

    it("fails distinctly when the wallet balance is insufficient (AC7)", async () => {
      const p = await seedProduct({ sku: "W2", name: "Big", priceCents: 9000, stockQty: 4 });
      await seedParentWallet("+254733111333", 1000);
      const creds = await login("+254712000002", "7422");
      const res = await sale(creds, { method: "wallet", lines: [{ productId: p.id, qty: 1 }], customerPhone: "0733111333" });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("failed");
      expect(res.json().failureReason).toMatch(/insufficient/iu);
    });

    it("lets a wallet sale be retried under the same key after a top-up (failed sale must not burn the key)", async () => {
      const p = await seedProduct({ sku: "W4", name: "Retry", priceCents: 3000, stockQty: 4 });
      const { walletId } = await seedParentWallet("+254733111444", 1000); // short
      const creds = await login("+254712000002", "7422");
      const key = "22222222-2222-4222-8222-222222222222";
      const body = { method: "wallet", lines: [{ productId: p.id, qty: 1 }], customerPhone: "0733111444", idempotencyKey: key };

      const failed = await sale(creds, body);
      expect(failed.json().status).toBe("failed");

      // Top the wallet up, then retry with the SAME idempotency key.
      await post(dbh.db, { walletId, amount: 5000, kind: "topup", idempotencyKey: "topup-retry", source: "seed", postedBy: walletId });
      const retried = await sale(creds, body);
      expect(retried.statusCode).toBe(200);
      expect(retried.json().status).toBe("paid");
    });

    it("404s when no parent wallet matches the phone", async () => {
      const p = await seedProduct({ sku: "W3", name: "Thing", priceCents: 1000, stockQty: 4 });
      const creds = await login("+254712000002", "7422");
      const res = await sale(creds, { method: "wallet", lines: [{ productId: p.id, qty: 1 }], customerPhone: "0700000000" });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("M-Pesa STK (AC3)", () => {
    it("initiates a pending sale then settles on confirm", async () => {
      app = build({ mpesa: true });
      const p = await seedProduct({ sku: "M1", name: "Goods", priceCents: 2000, stockQty: 5 });
      const creds = await login("+254712000002", "7422");
      const init = await sale(creds, { method: "mpesa", lines: [{ productId: p.id, qty: 1 }], customerPhone: "0744555666" });
      expect(init.statusCode).toBe(200);
      expect(init.json().status).toBe("pending");
      expect(init.json().checkoutRequestId).toBe("ws_CO_1");

      const saleId = init.json().saleId;
      const confirm = await app.inject({
        method: "POST",
        url: `/pos/sales/${saleId}/confirm`,
        headers: { cookie: creds.cookie, "x-csrf-token": creds.csrfToken },
        payload: {},
      });
      expect(confirm.statusCode).toBe(200);
      expect(confirm.json().status).toBe("paid");
      const [prod] = await dbh.db.select().from(products).where(eq(products.id, p.id));
      expect(prod!.stockQty).toBe(4);
    });

    it("rejects a non-whole-shilling total (M-Pesa charges whole shillings)", async () => {
      app = build({ mpesa: true });
      const p = await seedProduct({ sku: "M3", name: "Odd", priceCents: 1099, stockQty: 5 });
      const creds = await login("+254712000002", "7422");
      const res = await sale(creds, { method: "mpesa", lines: [{ productId: p.id, qty: 1 }], customerPhone: "0744555666" });
      expect(res.statusCode).toBe(400);
    });

    it("returns 503 when M-Pesa is not configured", async () => {
      const p = await seedProduct({ sku: "M2", name: "Goods", priceCents: 2000, stockQty: 5 });
      const creds = await login("+254712000002", "7422");
      const res = await sale(creds, { method: "mpesa", lines: [{ productId: p.id, qty: 1 }], customerPhone: "0744555666" });
      expect(res.statusCode).toBe(503);
    });
  });

  describe("Paystack (AC4)", () => {
    it("initiates a pending sale with a checkout URL, then settles on confirm", async () => {
      app = build({ paystack: true });
      const p = await seedProduct({ sku: "PS1", name: "Card item", priceCents: 3000, stockQty: 5 });
      const creds = await login("+254712000002", "7422");
      const init = await sale(creds, { method: "paystack", lines: [{ productId: p.id, qty: 1 }], customerPhone: "0755666777" });
      expect(init.statusCode).toBe(200);
      expect(init.json().status).toBe("pending");
      expect(init.json().authorizationUrl).toMatch(/checkout\.paystack\.com/u);

      const saleId = init.json().saleId;
      const confirm = await app.inject({
        method: "POST",
        url: `/pos/sales/${saleId}/confirm`,
        headers: { cookie: creds.cookie, "x-csrf-token": creds.csrfToken },
        payload: {},
      });
      expect(confirm.statusCode).toBe(200);
      expect(confirm.json().status).toBe("paid");
    });
  });
});
