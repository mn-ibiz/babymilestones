import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { invoices, parents, users, wallets, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import { balance, recentTransactions, RECENT_TRANSACTIONS_LIMIT } from "@bm/wallet";
import type { WalletOverview, WalletOverviewResponse } from "@bm/contracts";
import type { ParentsDeps } from "./index.js";

/** Resolve a session userId to its live id+role (for the session guard). */
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

/** Sum of open (non-settled) invoice amounts owed for a parent, in cents. */
async function outstandingForParent(db: Database, parentId: string): Promise<number> {
  const [row] = await db
    .select({ owed: sql<string>`COALESCE(SUM(${invoices.amountDue}), 0)` })
    .from(invoices)
    .where(and(eq(invoices.parentId, parentId), sql`${invoices.status} <> 'settled'`));
  return Number(row?.owed ?? 0);
}

/**
 * Parent wallet overview (P1-E11-S01).
 *
 * GET /parents/me/wallet — the authed parent's OWN wallet snapshot for the
 * dashboard wallet page: computed balance, outstanding owed, read-only
 * auto-credit status (AC1), the last 10 ledger postings newest-first (AC3), and
 * the read-only loyalty points balance (AC4 — earn-only in P1, so 0 until a
 * loyalty ledger lands). The wallet is resolved from the session userId, never
 * a param, so a parent can only ever read their own wallet. Read-only over
 * `@bm/wallet`; no mutation, so no CSRF beyond the GET session check.
 */
export function registerParentWallet(app: FastifyInstance, { db, sessions }: ParentsDeps): void {
  const resolveUser = makeResolveUser(db);

  app.get("/parents/me/wallet", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });

    // Resolve the wallet + parent identity from the session user. Outstanding is
    // keyed on parents.id; the parent row may be absent for a wallet-only user.
    const [row] = await db
      .select({ walletId: wallets.id, autoCreditEnabled: wallets.autoCreditEnabled, parentId: parents.id })
      .from(wallets)
      .leftJoin(parents, eq(parents.userId, wallets.userId))
      .where(eq(wallets.userId, auth.user.id));
    if (!row) return reply.code(404).send({ error: "Wallet not found" });

    const [balanceCents, outstandingCents, recent] = await Promise.all([
      balance(db, row.walletId),
      row.parentId ? outstandingForParent(db, row.parentId) : Promise.resolve(0),
      recentTransactions(db, row.walletId, { limit: RECENT_TRANSACTIONS_LIMIT }),
    ]);

    const wallet: WalletOverview = {
      balanceCents,
      outstandingCents,
      autoCreditEnabled: row.autoCreditEnabled,
      // Loyalty is earn-only in P1 with no points ledger yet (display-only, AC4).
      loyaltyPoints: 0,
      recentTransactions: recent,
    };
    const body: WalletOverviewResponse = { wallet };
    return reply.code(200).send(body);
  });
}
