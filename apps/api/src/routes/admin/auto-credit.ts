import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, wallets, type Database } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import { autoCreditToggleSchema } from "@bm/contracts";
import type { AdminDeps } from "./index.js";

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
 * Per-parent auto-credit toggle (P1-E03-S07).
 *
 * GET  /admin/parents/:userId/auto-credit  → read the current flag.
 * PATCH /admin/parents/:userId/auto-credit → set it (admin/super_admin only).
 *
 * The flag lives on `wallets.auto_credit_enabled` (added in P1-E03-S05) and is
 * consulted by the check-in debit path: ON → an underfunded check-in debits
 * anyway (balance may go negative) and settles `settled_on_credit`; OFF
 * (default) → the invoice is left `outstanding`. AC1 (default FALSE) is the
 * column default; AC2 gates flipping behind `manage wallet`, which only `admin`
 * and `super_admin` hold (reception/cashier have only `read wallet`); AC3 audits
 * the change with before/after values + actor.
 */
export function registerAdminAutoCredit(app: FastifyInstance, deps: AdminDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const readGuard = requirePermission("read", "wallet");
  const manageGuard = requirePermission("manage", "wallet");

  /** Look up a parent's wallet by their user id. */
  async function walletForUser(userId: string) {
    const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    return w ?? null;
  }

  app.get(
    "/admin/parents/:userId/auto-credit",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const auth = await validateSession(
        {
          method: req.method,
          cookieHeader: req.headers.cookie ?? null,
          csrfHeader: csrfHeaderOf(req),
        },
        { sessions, resolveUser },
      );
      if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
      const perm = readGuard(auth.user);
      if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });

      const { userId } = req.params as { userId: string };
      const wallet = await walletForUser(userId);
      if (!wallet) return reply.code(404).send({ error: "Parent wallet not found" });

      return reply.code(200).send({ autoCreditEnabled: wallet.autoCreditEnabled });
    },
  );

  app.patch(
    "/admin/parents/:userId/auto-credit",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const auth = await validateSession(
        {
          method: req.method,
          cookieHeader: req.headers.cookie ?? null,
          csrfHeader: csrfHeaderOf(req),
        },
        { sessions, resolveUser },
      );
      if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
      const perm = manageGuard(auth.user);
      if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });

      const parsed = autoCreditToggleSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return reply
          .code(400)
          .send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
      }
      const { autoCreditEnabled } = parsed.data;

      const { userId } = req.params as { userId: string };
      const wallet = await walletForUser(userId);
      if (!wallet) return reply.code(404).send({ error: "Parent wallet not found" });

      // No-op when unchanged, but still record the actor's intent (AC3): write
      // the update + audit row in one transaction so they commit together.
      const before = wallet.autoCreditEnabled;
      await db.transaction(async (tx) => {
        await tx
          .update(wallets)
          .set({ autoCreditEnabled })
          .where(eq(wallets.id, wallet.id));
        await audit(tx, {
          actor: auth.user.id,
          action: "wallet.auto_credit_toggle",
          target: { table: "wallets", id: wallet.id },
          payload: {
            user_id: userId,
            before,
            after: autoCreditEnabled,
          },
        });
      });

      return reply.code(200).send({ autoCreditEnabled });
    },
  );
}
