import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import { getEffectiveRates, setRate } from "@bm/wallet";
import type { AdminDeps } from "./index.js";

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
 * Configurable loyalty earn/redeem rates (P2-E05-S02). Admins tune the loyalty
 * programme without a code change. Reads return the rates effective NOW; writes
 * append a NEW effective-dated row (prior rows are never mutated, so historical
 * earnings/redemptions are unchanged — AC2). Reads gated to `read settings`, the
 * change to `manage settings`, audited (`loyalty.rate_change`).
 *
 *  GET  /admin/loyalty/rates
 *  POST /admin/loyalty/rates  { rateType, value, effectiveFrom? }
 */
export function registerAdminLoyaltyRates(app: FastifyInstance, deps: AdminDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  // Loyalty rates are part of the admin "config" surface (same gate as the
  // Settings sub-app, which uses `manage config`). Admin/super_admin hold it;
  // reception/treasury do not (→ 403). Both read + write use the same grant,
  // mirroring admin/settings.ts.
  const readGuard = requirePermission("manage", "config");
  const writeGuard = requirePermission("manage", "config");

  app.get("/admin/loyalty/rates", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
    const perm = readGuard(auth.user);
    if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });
    const rates = await getEffectiveRates(db);
    return reply.code(200).send(rates);
  });

  app.post("/admin/loyalty/rates", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
    const perm = writeGuard(auth.user);
    if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });

    const body = (req.body ?? {}) as {
      rateType?: unknown;
      value?: unknown;
      effectiveFrom?: unknown;
    };
    if (body.rateType !== "earn" && body.rateType !== "redeem") {
      return reply.code(400).send({ error: "rateType must be 'earn' or 'redeem'" });
    }
    if (!Number.isInteger(body.value) || (body.value as number) <= 0) {
      return reply.code(400).send({ error: "value must be a positive integer" });
    }
    let effectiveFrom: Date | undefined;
    if (typeof body.effectiveFrom === "string") {
      const d = new Date(body.effectiveFrom);
      if (Number.isNaN(d.getTime())) {
        return reply.code(400).send({ error: "effectiveFrom must be a valid date" });
      }
      effectiveFrom = d;
    }

    const row = await setRate(db, {
      rateType: body.rateType,
      value: body.value as number,
      effectiveFrom,
      actor: auth.user.id,
    });
    return reply.code(201).send({
      id: row.id,
      rateType: row.rateType,
      value: row.value,
      effectiveFrom: row.effectiveFrom.toISOString(),
    });
  });
}
