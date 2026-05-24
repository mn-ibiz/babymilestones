import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, wallets, type Database } from "@bm/db";
import { validateSession, requirePermission, isStaffRole, CSRF_HEADER_NAME } from "@bm/auth";
import { generateStatementCsv, isAsyncRange, type StatementRange } from "@bm/wallet";
import type { ParentsDeps } from "./index.js";

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

export interface StatementRoutesDeps extends ParentsDeps {
  /**
   * Enqueue an async statement generation for a long (> 12 month) range
   * (AC3). Defaults to a fire-and-forget no-op handle in {@link app.ts}; tests
   * inject a deterministic recorder.
   */
  enqueueStatement?: (input: {
    walletId: string;
    from: string;
    to: string;
    requestedBy: string;
  }) => void;
}

/** Parse an inclusive `from`/`to` query into a {@link StatementRange}. */
function parseRange(q: { from?: string; to?: string }): StatementRange | null {
  if (!q.from || !q.to) return null;
  const from = new Date(q.from);
  const to = new Date(q.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (from.getTime() > to.getTime()) return null;
  return { from, to };
}

/**
 * Wallet statement CSV export (P1-E03-S08).
 *
 * - GET /parents/me/statement?from=&to=            → the authed parent exports
 *   their OWN wallet statement. The wallet is resolved from the session userId,
 *   never the query, so a parent can only ever export their own statement.
 * - GET /parents/:userId/statement?from=&to=       → staff holding `read wallet`
 *   (reception/cashier/admin/super_admin) export a given parent's statement.
 *   Parents are rejected here (they have no `read wallet` over arbitrary ids and
 *   must use the /me route).
 *
 * AC1: CSV columns timestamp,kind,direction,amount,balance after,reference with
 * a running balance-after derived from the ledger (P1-E03-S02). AC3: ranges
 * ≤ 12 months generate synchronously and stream the CSV (200); longer ranges
 * enqueue an async job and return 202. Every export is audited.
 */
export function registerParentStatement(app: FastifyInstance, deps: StatementRoutesDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const readGuard = requirePermission("read", "wallet");
  const enqueueStatement = deps.enqueueStatement ?? (() => {});

  async function walletForUser(userId: string) {
    const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    return w ?? null;
  }

  /** Shared handler once the target wallet + actor are known. */
  async function respond(
    reply: FastifyReply,
    req: FastifyRequest,
    opts: { walletId: string; parentUserId: string; actorId: string; range: StatementRange },
  ) {
    const { walletId, parentUserId, actorId, range } = opts;
    const from = range.from.toISOString();
    const to = range.to.toISOString();

    // AC3: long ranges go async to avoid blocking the request.
    if (isAsyncRange(range)) {
      enqueueStatement({ walletId, from, to, requestedBy: actorId });
      await audit(db, {
        actor: actorId,
        action: "wallet.statement.export.enqueued",
        target: { table: "wallets", id: walletId },
        payload: { parent_user_id: parentUserId, from, to, mode: "async" },
      });
      return reply.code(202).send({ status: "pending", from, to });
    }

    const csv = await generateStatementCsv(db, { walletId, range });
    await audit(db, {
      actor: actorId,
      action: "wallet.statement.export",
      target: { table: "wallets", id: walletId },
      payload: { parent_user_id: parentUserId, from, to, mode: "sync" },
    });
    return reply
      .code(200)
      .header("content-type", "text/csv; charset=utf-8")
      .header(
        "content-disposition",
        `attachment; filename="wallet-statement-${walletId}.csv"`,
      )
      .send(csv);
  }

  // --- Parent: own statement (wallet from the session, never the query). ---
  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/parents/me/statement",
    async (req, reply) => {
      const auth = await validateSession(
        { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
        { sessions, resolveUser },
      );
      if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });

      const range = parseRange(req.query);
      if (!range) return reply.code(400).send({ error: "Provide a valid from/to date range" });

      const wallet = await walletForUser(auth.user.id);
      if (!wallet) return reply.code(404).send({ error: "Wallet not found" });

      return respond(reply, req, {
        walletId: wallet.id,
        parentUserId: auth.user.id,
        actorId: auth.user.id,
        range,
      });
    },
  );

  // --- Staff (read wallet): a given parent's statement (Reception, admin). ---
  app.get<{ Params: { userId: string }; Querystring: { from?: string; to?: string } }>(
    "/parents/:userId/statement",
    async (req, reply) => {
      const auth = await validateSession(
        { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
        { sessions, resolveUser },
      );
      if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
      // Parents also hold `read wallet`, but only over their OWN wallet (the /me
      // route). The by-id route is staff-only so a parent cannot traverse to
      // another parent's wallet by guessing a userId.
      if (!isStaffRole(auth.user.role)) {
        return reply.code(403).send({ error: "Forbidden: missing permission" });
      }
      const perm = readGuard(auth.user);
      if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });

      const range = parseRange(req.query);
      if (!range) return reply.code(400).send({ error: "Provide a valid from/to date range" });

      const { userId } = req.params;
      const wallet = await walletForUser(userId);
      if (!wallet) return reply.code(404).send({ error: "Parent wallet not found" });

      return respond(reply, req, {
        walletId: wallet.id,
        parentUserId: userId,
        actorId: auth.user.id,
        range,
      });
    },
  );
}
