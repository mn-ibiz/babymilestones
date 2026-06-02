import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import {
  computeSyncHealth,
  listWcDeadLetters,
  replayWcDeadLetter,
  resolveWcDeadLetter,
  discardWcDeadLetter,
} from "@bm/woocommerce";
import type { SessionStore } from "@bm/auth";

/** A job the sync surface can trigger (the registered wc-sync-pull). Injected so
 * the API never imports `apps/jobs`. */
export interface SyncTriggerJob {
  name: string;
  run: () => Promise<void>;
}

export interface AdminWooCommerceSyncDeps {
  db: Database;
  sessions: SessionStore;
  /** Runnable jobs (the same registry the run-now console uses); the pull is found by name. */
  jobs?: SyncTriggerJob[];
  /** Clock injection for deterministic timestamps in tests. */
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
 * Admin WooCommerce sync surface (P4-E04-S07 / Story 29.7). All routes reserved
 * to `manage config` (admin / super_admin), enforced server-side.
 *
 *   GET  /admin/woocommerce-sync/health                  — last-pull / queue depth /
 *                                                          dead-letter count / last
 *                                                          10 errors / staleness (AC5)
 *   GET  /admin/woocommerce-sync/dead-letters            — list un-actioned (AC4)
 *   POST /admin/woocommerce-sync/dead-letters/:id/replay  — re-enqueue (AC4)
 *   POST /admin/woocommerce-sync/dead-letters/:id/resolve — mark resolved (AC4)
 *   POST /admin/woocommerce-sync/dead-letters/:id/discard — drop permanently (AC4)
 *   POST /admin/woocommerce-sync/sync-now                 — trigger an immediate
 *                                                          pull (admin-only, AC7)
 *
 * Reads are not audited; the dead-letter actions + sync-now are audited mutations.
 */
export function registerAdminWooCommerceSync(
  app: FastifyInstance,
  deps: AdminWooCommerceSyncDeps,
): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const now = deps.now ?? (() => new Date());
  const pullJob = (deps.jobs ?? []).find((j) => j.name === "wc-sync-pull") ?? null;

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

  // AC5: the sync-health snapshot (read-only).
  app.get("/admin/woocommerce-sync/health", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const health = await computeSyncHealth(db, { now: now() });
    return reply.code(200).send(health);
  });

  // AC4: list un-actioned dead-letter writebacks (read-only).
  app.get("/admin/woocommerce-sync/dead-letters", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const rows = await listWcDeadLetters(db);
    return reply.code(200).send({
      deadLetters: rows.map((r) => ({
        id: r.id,
        idempotencyKey: r.idempotencyKey,
        kind: r.kind,
        request: r.request,
        attempts: r.attempts,
        lastError: r.lastError,
        deadLetteredAt: r.deadLetteredAt.toISOString(),
      })),
    });
  });

  // AC4: replay a dead-letter — re-enqueue into the live outbox.
  app.post(
    "/admin/woocommerce-sync/dead-letters/:id/replay",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply);
      if (!actor) return reply;
      const { id } = req.params as { id: string };
      try {
        const enqueued = await replayWcDeadLetter(db, { id, now: now() });
        await audit(db, {
          actor: actor.id,
          action: "woocommerce.deadletter.replayed",
          target: { table: "wc_outbox_dead", id },
          payload: { idempotency_key: enqueued.idempotencyKey, kind: enqueued.kind, ip: req.ip },
        });
        return reply.code(200).send({ id, status: "replayed", outboxId: enqueued.id });
      } catch {
        return reply.code(404).send({ error: "No replayable dead-letter with that id" });
      }
    },
  );

  // AC4: mark a dead-letter resolved.
  app.post(
    "/admin/woocommerce-sync/dead-letters/:id/resolve",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply);
      if (!actor) return reply;
      const { id } = req.params as { id: string };
      try {
        const row = await resolveWcDeadLetter(db, { id, now: now() });
        await audit(db, {
          actor: actor.id,
          action: "woocommerce.deadletter.resolved",
          target: { table: "wc_outbox_dead", id },
          payload: { idempotency_key: row.idempotencyKey, ip: req.ip },
        });
        return reply.code(200).send({ id, status: "resolved" });
      } catch {
        return reply.code(404).send({ error: "No actionable dead-letter with that id" });
      }
    },
  );

  // AC4: discard a dead-letter permanently.
  app.post(
    "/admin/woocommerce-sync/dead-letters/:id/discard",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply);
      if (!actor) return reply;
      const { id } = req.params as { id: string };
      try {
        const row = await discardWcDeadLetter(db, { id, now: now() });
        await audit(db, {
          actor: actor.id,
          action: "woocommerce.deadletter.discarded",
          target: { table: "wc_outbox_dead", id },
          payload: { idempotency_key: row.idempotencyKey, ip: req.ip },
        });
        return reply.code(200).send({ id, status: "discarded" });
      } catch {
        return reply.code(404).send({ error: "No actionable dead-letter with that id" });
      }
    },
  );

  // AC7: "Sync now" — trigger an immediate pull. Admin-only (manage config); the
  // pull job is found in the injected registry so the API stays decoupled.
  app.post("/admin/woocommerce-sync/sync-now", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    // Audit the manual trigger (a mutation) before running.
    await audit(db, {
      actor: actor.id,
      action: "woocommerce.sync.triggered",
      target: { table: "wc_sync_state", id: null },
      payload: { ip: req.ip },
    });

    if (!pullJob) {
      // No worker wired in this surface — the trigger is still audited, but the
      // pull can't run here.
      return reply.code(503).send({ error: "Sync worker is not available" });
    }
    try {
      await pullJob.run();
      return reply.code(200).send({ status: "triggered" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      req.log?.error?.({ event: "woocommerce.sync.triggered.failed", err: message });
      return reply.code(200).send({ status: "failed", error: message });
    }
  });
}
