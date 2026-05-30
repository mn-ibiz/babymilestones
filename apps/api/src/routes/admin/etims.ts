import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import { listDeadLetters, requeueDeadLetter } from "@bm/payments";
import type { SessionStore } from "@bm/auth";

export interface AdminEtimsDeps {
  db: Database;
  sessions: SessionStore;
  /** Clock injection for deterministic requeue timestamps in tests. */
  now?: () => Date;
}

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
 * eTIMS dead-letter inspection + manual retry (P5-E02-S02 AC3). Surfaces the
 * permanently-failed KRA submissions to admins and lets them re-queue one for
 * another attempt by the retry worker.
 *
 *   GET  /admin/etims/dead-letters       — list dead-lettered submissions (read).
 *   POST /admin/etims/dead-letters/:id/retry — re-queue one (audited mutation).
 *
 * Guarded by `manage config` (admin / super_admin), enforced server-side. The
 * list is a read (not audited); the retry is an audited mutation.
 */
export function registerAdminEtims(app: FastifyInstance, deps: AdminEtimsDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const now = deps.now ?? (() => new Date());

  async function authorize(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<PermissionPrincipal | null> {
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
      return null;
    }
    if (!can(auth.user.role, "manage", "config")) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  // AC3: inspect dead-lettered eTIMS submissions (read-only).
  app.get("/admin/etims/dead-letters", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const rows = await listDeadLetters(db);
    return reply.code(200).send({
      deadLetters: rows.map((r) => ({
        id: r.id,
        idempotencyKey: r.idempotencyKey,
        series: r.series,
        sequenceNumber: r.sequenceNumber,
        attempts: r.attempts,
        lastError: r.lastError,
        deadLetteredAt: r.deadLetteredAt ? r.deadLetteredAt.toISOString() : null,
      })),
    });
  });

  // AC3: manually re-queue one dead-lettered submission for another attempt.
  app.post(
    "/admin/etims/dead-letters/:id/retry",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply);
      if (!actor) return reply;
      const { id } = req.params as { id: string };

      // Only a dead-lettered row may be manually re-queued.
      const dead = await listDeadLetters(db);
      const target = dead.find((r) => r.id === id);
      if (!target) {
        return reply.code(404).send({ error: "No dead-lettered eTIMS submission with that id" });
      }

      const row = await requeueDeadLetter(db, { id, now: now() });
      await audit(db, {
        actor: actor.id,
        action: "etims.submission.requeued",
        target: { table: "kra_etims_queue", id },
        payload: { idempotency_key: row.idempotencyKey, ip: req.ip },
      });

      return reply.code(200).send({
        id: row.id,
        idempotencyKey: row.idempotencyKey,
        status: row.status,
      });
    },
  );
}
