import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import {
  validateSession,
  can,
  auditAction,
  CSRF_HEADER_NAME,
  type PermissionPrincipal,
} from "@bm/auth";
import { getStaff, listCommissionRates, setCommissionRate } from "@bm/catalog";
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
 * Admin per-staff commission-rate CRUD (P3-E01-S01 AC2). Admin-gated under the
 * service-catalogue surface (`manage service` — the same gate as the staff
 * records the rates attach to). Setting a rate auto-closes the previous open one
 * in the catalog layer; every rate change is audited (AC4). The history read is
 * not audited (reads are never audited).
 *
 *   GET  /admin/staff/:id/commission-rates  — rate history (newest first)
 *   POST /admin/staff/:id/commission-rates  — set / correct a rate
 */
export function registerCommissionRateRoutes(app: FastifyInstance, deps: AdminDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  async function authorize(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<PermissionPrincipal | null> {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    if (!can(auth.user.role, "manage", "service")) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  // List a staff member's rate history (newest-first). Read — not audited.
  app.get("/admin/staff/:id/commission-rates", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const member = await getStaff(db, id);
    if (!member) return reply.code(404).send({ error: "Staff not found" });
    const rates = await listCommissionRates(db, id);
    return reply.code(200).send({ rates });
  });

  // Set (or correct) a staff member's commission rate effective from an instant.
  app.post("/admin/staff/:id/commission-rates", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;

    const rateRaw = body.ratePercent;
    const rateNum = typeof rateRaw === "number" ? rateRaw : typeof rateRaw === "string" ? Number(rateRaw) : NaN;
    if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100) {
      return reply.code(400).send({ error: "ratePercent must be a number between 0 and 100" });
    }
    const effFromStr = typeof body.effectiveFrom === "string" ? body.effectiveFrom : "";
    const effectiveFrom = effFromStr ? new Date(effFromStr) : null;
    if (!effectiveFrom || Number.isNaN(effectiveFrom.getTime())) {
      return reply.code(400).send({ error: "effectiveFrom must be a valid ISO timestamp" });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;

    const member = await getStaff(db, id);
    if (!member) return reply.code(404).send({ error: "Staff not found" });

    let rate;
    try {
      rate = await setCommissionRate(db, { staffId: id, ratePercent: rateNum, effectiveFrom, reason });
    } catch (err) {
      // e.g. effective_from before the current open rate's start.
      return reply.code(400).send({ error: err instanceof Error ? err.message : "invalid rate change" });
    }

    await audit(db, {
      actor: actor.id,
      action: auditAction("commission.rate.set"),
      target: { table: "staff_commission_rates", id: rate.id },
      payload: {
        staff_id: id,
        rate_percent: rate.ratePercent,
        effective_from: effectiveFrom.toISOString(),
        reason,
        ip: req.ip,
      },
    });
    return reply.code(201).send({ rate });
  });
}
