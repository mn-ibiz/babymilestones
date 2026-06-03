import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database } from "@bm/db";
import { validateSession, requirePermission, isStaffRole, CSRF_HEADER_NAME } from "@bm/auth";
import { recentTransactions, RECENT_TRANSACTIONS_LIMIT } from "@bm/wallet";
import type { RecentTransaction, RecentTransactionsResponse } from "@bm/contracts";
import { loadParentRecord } from "./parent-profile.js";
import type { ReceptionDeps } from "./index.js";

/** Resolve a session userId to its live id+role (for the permission guard). */
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

/**
 * Reception recent-transactions panel (P1-E05-S05).
 *
 * GET /reception/parents/:userId/recent-transactions — latest N (default 10)
 * wallet-ledger postings for a parent, newest-first, each with the running
 * balance-after (AC1). Read-only over `@bm/wallet`; guarded to `read wallet`
 * (staff-only — packer/treasury are rejected). Unknown parent → 404.
 */
export function registerRecentTransactions(
  app: FastifyInstance,
  { db, sessions }: ReceptionDeps,
): void {
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("read", "wallet");

  async function authorize(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const auth = await validateSession(
      {
        method: req.method,
        cookieHeader: req.headers.cookie ?? null,
        csrfHeader: csrfHeaderOf(req),
      },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return false;
    }
    // Parents also hold `read wallet` (over their OWN wallet only). This by-:userId
    // route is staff-only — without this gate a parent could read another parent's
    // recent ledger postings by guessing a userId (mirrors statement.ts).
    if (!isStaffRole(auth.user.role)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return false;
    }
    const perm = guard(auth.user);
    if (!perm.ok) {
      reply.code(perm.status).send({ error: perm.error });
      return false;
    }
    return true;
  }

  app.get(
    "/reception/parents/:userId/recent-transactions",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!(await authorize(req, reply))) return reply;
      const { userId } = req.params as { userId: string };
      const rec = await loadParentRecord(db, userId);
      if (!rec) return reply.code(404).send({ error: "Parent not found" });

      const rows = await recentTransactions(db, rec.walletId, {
        limit: RECENT_TRANSACTIONS_LIMIT,
      });
      // The wallet helper's shape is the wire shape (cents in, cents out).
      const transactions: RecentTransaction[] = rows;
      const body: RecentTransactionsResponse = { transactions };
      return reply.code(200).send(body);
    },
  );
}
