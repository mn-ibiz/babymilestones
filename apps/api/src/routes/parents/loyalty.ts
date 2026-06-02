import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { parents, users, wallets, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import {
  getEffectiveRates,
  getLoyaltyHistory,
  getLoyaltyTotals,
  kesForPoints,
  redeemPoints,
  InsufficientPointsError,
} from "@bm/wallet";
import type {
  LoyaltyAccountResponse,
  LoyaltyHistoryItem,
  LoyaltyRedemptionQuote,
  RedeemPointsResponse,
} from "@bm/contracts";
import type { ParentsDeps } from "./index.js";

function makeResolveUser(db: Database) {
  return async (userId: string) => {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return u ? { id: u.id, role: u.role } : null;
  };
}

function csrfHeaderOf(req: FastifyRequest): string | null {
  const raw = req.headers[CSRF_HEADER_NAME];
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

/** Resolve the session parent's profile + wallet. Returns null + sends the
 *  appropriate error reply when unauthenticated / missing. */
async function resolveParentWallet(
  db: Database,
  sessions: ParentsDeps["sessions"],
  req: FastifyRequest,
  reply: FastifyReply,
  csrf: string | null,
): Promise<{ walletId: string; userId: string } | null> {
  const auth = await validateSession(
    { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrf },
    { sessions, resolveUser: makeResolveUser(db) },
  );
  if (!auth.ok) {
    reply.code(auth.status).send({ error: auth.error });
    return null;
  }
  const [profile] = await db.select().from(parents).where(eq(parents.userId, auth.user.id));
  if (!profile) {
    reply.code(404).send({ error: "Parent profile not found" });
    return null;
  }
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, auth.user.id));
  if (!wallet) {
    reply.code(404).send({ error: "Wallet not found" });
    return null;
  }
  return { walletId: wallet.id, userId: auth.user.id };
}

/**
 * Parent loyalty surface (P2-E05-S03 + S04).
 *
 *  GET  /parents/me/loyalty          — balance, lifetime totals, history (S04) +
 *                                       a redemption quote for checkout (S03 AC1).
 *  POST /parents/me/loyalty/redeem   — redeem points for wallet credit (S03).
 *
 * Ownership is derived server-side from the session (the wallet belongs to the
 * logged-in user). The read is not audited; the redemption is (loyalty.redeem,
 * inside @bm/wallet). The mutation requires the CSRF token.
 */
export function registerParentLoyalty(app: FastifyInstance, deps: ParentsDeps): void {
  const { db, sessions } = deps;

  app.get("/parents/me/loyalty", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await resolveParentWallet(db, sessions, req, reply, null);
    if (!ctx) return reply;

    const totals = await getLoyaltyTotals(db, ctx.walletId);
    const rows = await getLoyaltyHistory(db, ctx.walletId, { limit: 100 });
    const { redeemRate } = await getEffectiveRates(db);

    const history: LoyaltyHistoryItem[] = rows.map((r) => ({
      id: r.id,
      direction: (r.direction ?? "earn") as "earn" | "redeem",
      points: r.points ?? 0,
      sourceType: r.sourceType ?? "",
      sourceId: r.sourceId ?? null,
      date: r.createdAt.toISOString(),
    }));

    const quote: LoyaltyRedemptionQuote = {
      availablePoints: totals.balance,
      maxDiscountCents: kesForPoints(totals.balance, redeemRate),
      redeemRate,
    };

    const body: LoyaltyAccountResponse = {
      balance: totals.balance,
      lifetimeEarned: totals.lifetimeEarned,
      lifetimeRedeemed: totals.lifetimeRedeemed,
      history,
      quote,
    };
    return reply.code(200).send(body);
  });

  app.post("/parents/me/loyalty/redeem", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await resolveParentWallet(db, sessions, req, reply, csrfHeaderOf(req));
    if (!ctx) return reply;

    const body = (req.body ?? {}) as { points?: unknown; idempotencyKey?: unknown };
    if (!Number.isInteger(body.points) || (body.points as number) <= 0) {
      return reply.code(400).send({ error: "points must be a positive integer" });
    }
    if (typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim() === "") {
      return reply.code(400).send({ error: "idempotencyKey is required" });
    }

    try {
      const result = await redeemPoints(db, {
        walletId: ctx.walletId,
        points: body.points as number,
        idempotencyKey: body.idempotencyKey,
        actor: ctx.userId,
        sourceType: "parent_checkout",
      });
      const out: RedeemPointsResponse = {
        redeemedPoints: result.redeemedPoints,
        discountCents: result.discountCents,
        balance: result.balance,
      };
      return reply.code(200).send(out);
    } catch (err) {
      if (err instanceof InsufficientPointsError) {
        return reply.code(409).send({ error: "Not enough points to redeem" });
      }
      throw err;
    }
  });
}
