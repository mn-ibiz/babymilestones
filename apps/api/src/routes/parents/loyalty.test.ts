import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { parents, users, wallets, loyaltyLedger } from "@bm/db";
import { createTestDb } from "@bm/db/testing";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import { earnPoints, getLoyaltyBalance, balance as walletBalance } from "@bm/wallet";
import { buildApp } from "../../app.js";
import type { FastifyInstance } from "fastify";

const PHONE = "+254712345678";
const RAW = "0712345678";
const PIN = "1357";

/**
 * P2-E05-S03 (redemption at parent checkout) + P2-E05-S04 (balance/history read).
 */
describe("parent loyalty (P2-E05-S03/S04)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: FastifyInstance;
  let userId: string;
  let walletId: string;
  let sessionCookie: string;
  let csrfToken: string;

  async function loginAs(phone: string, raw: string, pin: string) {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { phone: raw, pin } });
    const cookies = login.headers["set-cookie"] as string[];
    const cookie = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    return { cookie, csrfToken: login.json().csrfToken as string };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore() });
    const [u] = await dbh.db.insert(users).values({ phone: PHONE, pinHash: await hashPin(PIN) }).returning();
    userId = u!.id;
    await dbh.db.insert(parents).values({ userId, firstName: "Test", lastName: "Parent" });
    const [w] = await dbh.db.insert(wallets).values({ userId }).returning();
    walletId = w!.id;
    const s = await loginAs(PHONE, RAW, PIN);
    sessionCookie = s.cookie;
    csrfToken = s.csrfToken;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  async function earn(points: number, key: string) {
    await earnPoints(dbh.db, {
      walletId,
      points,
      rateSnapshot: 100,
      sourceType: "topup",
      idempotencyKey: key,
    });
  }

  describe("GET /parents/me/loyalty (S04 + S03 quote)", () => {
    it("returns balance, lifetime totals, history and a redemption quote", async () => {
      await earn(100, "e1");
      const res = await app.inject({
        method: "GET",
        url: "/parents/me/loyalty",
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.balance).toBe(100);
      expect(body.lifetimeEarned).toBe(100);
      expect(body.lifetimeRedeemed).toBe(0);
      expect(body.history).toHaveLength(1);
      // quote: 100 points at default redeem rate 1 -> 100 KES -> 10000 cents (AC1)
      expect(body.quote).toEqual({
        availablePoints: 100,
        maxDiscountCents: 10000,
        redeemRate: 1,
      });
    });

    it("rejects an unauthenticated request (401)", async () => {
      const res = await app.inject({ method: "GET", url: "/parents/me/loyalty" });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /parents/me/loyalty/redeem (S03)", () => {
    it("redeems points -> wallet credit and deducts the loyalty balance (AC2, AC4)", async () => {
      await earn(100, "e1");
      const res = await app.inject({
        method: "POST",
        url: "/parents/me/loyalty/redeem",
        headers: { cookie: sessionCookie, "x-csrf-token": csrfToken },
        payload: { points: 40, idempotencyKey: "redeem-1" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ redeemedPoints: 40, discountCents: 4000, balance: 60 });
      expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(60);
      expect(await walletBalance(dbh.db, walletId)).toBe(4000);
    });

    it("cannot redeem more than the balance (409, AC3)", async () => {
      await earn(30, "e1");
      const res = await app.inject({
        method: "POST",
        url: "/parents/me/loyalty/redeem",
        headers: { cookie: sessionCookie, "x-csrf-token": csrfToken },
        payload: { points: 31, idempotencyKey: "redeem-over" },
      });
      expect(res.statusCode).toBe(409);
      expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(30);
      expect(await walletBalance(dbh.db, walletId)).toBe(0);
    });

    it("is idempotent on idempotencyKey (no double-spend, AC3)", async () => {
      await earn(100, "e1");
      const first = await app.inject({
        method: "POST",
        url: "/parents/me/loyalty/redeem",
        headers: { cookie: sessionCookie, "x-csrf-token": csrfToken },
        payload: { points: 40, idempotencyKey: "dup" },
      });
      const second = await app.inject({
        method: "POST",
        url: "/parents/me/loyalty/redeem",
        headers: { cookie: sessionCookie, "x-csrf-token": csrfToken },
        payload: { points: 40, idempotencyKey: "dup" },
      });
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      const redeems = await dbh.db
        .select()
        .from(loyaltyLedger)
        .where(eq(loyaltyLedger.direction, "redeem"));
      expect(redeems).toHaveLength(1);
      expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(60);
      expect(await walletBalance(dbh.db, walletId)).toBe(4000);
    });

    it("rejects a bad payload (400)", async () => {
      await earn(100, "e1");
      const res = await app.inject({
        method: "POST",
        url: "/parents/me/loyalty/redeem",
        headers: { cookie: sessionCookie, "x-csrf-token": csrfToken },
        payload: { points: 0, idempotencyKey: "x" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects the mutation without a CSRF token", async () => {
      await earn(100, "e1");
      const res = await app.inject({
        method: "POST",
        url: "/parents/me/loyalty/redeem",
        headers: { cookie: sessionCookie },
        payload: { points: 40, idempotencyKey: "no-csrf" },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
