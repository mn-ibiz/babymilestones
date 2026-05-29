import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import type { SessionStore } from "@bm/auth";
import { planCreateSchema, planUpdateSchema, planPriceCreateSchema } from "@bm/contracts";
import {
  createPlan,
  getPlan,
  getService,
  listPlans,
  listPlanPrices,
  setPlanPrice,
  updatePlan,
  PlanPriceOrderError,
} from "@bm/catalog";

export interface AdminPlansDeps {
  db: Database;
  sessions: SessionStore;
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

function serializePlan(row: NonNullable<Awaited<ReturnType<typeof getPlan>>>) {
  return {
    id: row.id,
    serviceId: row.serviceId,
    name: row.name,
    entitlementCount: row.entitlementCount,
    period: row.period,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializePlanPrice(row: {
  id: string;
  planId: string;
  amountCents: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    planId: row.planId,
    amountCents: row.amountCents,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdAt: row.createdAt,
  };
}

/**
 * Subscription plan administration (P2-E02-S01). Reserved to `manage service`
 * (admin / super_admin) — plans are service configuration.
 *
 *   GET    /admin/services/:serviceId/plans  — list a service's plans
 *   POST   /admin/services/:serviceId/plans  — create a plan (AC1)
 *   GET    /admin/plans/:id                  — read one
 *   PATCH  /admin/plans/:id                  — update; soft-retire via isActive (AC2)
 *   GET    /admin/plans/:id/prices           — effective-dated price history (AC3)
 *   POST   /admin/plans/:id/prices           — set a new price; closes old row (AC3)
 *
 * Every mutation writes an `audit_outbox` row (AC2). The acting user is the
 * session user, never the client.
 */
export function registerAdminPlans(app: FastifyInstance, deps: AdminPlansDeps): void {
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

  app.get("/admin/services/:serviceId/plans", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { serviceId } = req.params as { serviceId: string };
    const service = await getService(db, serviceId);
    if (!service) return reply.code(404).send({ error: "Service not found" });
    const rows = await listPlans(db, { serviceId });
    return reply.code(200).send({ plans: rows.map(serializePlan) });
  });

  app.post("/admin/services/:serviceId/plans", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { serviceId } = req.params as { serviceId: string };
    const service = await getService(db, serviceId);
    if (!service) return reply.code(404).send({ error: "Service not found" });
    const parsed = planCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const row = await createPlan(db, { serviceId, ...parsed.data });
    await audit(db, {
      actor: actor.id,
      action: "catalog.plan.create",
      target: { table: "subscription_plans", id: row.id },
      payload: { service_id: serviceId, name: row.name, entitlement_count: row.entitlementCount, period: row.period, ip: req.ip },
    });
    return reply.code(201).send(serializePlan(row));
  });

  app.get("/admin/plans/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const row = await getPlan(db, id);
    if (!row) return reply.code(404).send({ error: "Plan not found" });
    return reply.code(200).send(serializePlan(row));
  });

  app.patch("/admin/plans/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const parsed = planUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { id } = req.params as { id: string };
    const existing = await getPlan(db, id);
    if (!existing) return reply.code(404).send({ error: "Plan not found" });
    const row = await updatePlan(db, id, parsed.data);
    await audit(db, {
      actor: actor.id,
      action: "catalog.plan.update",
      target: { table: "subscription_plans", id },
      payload: { changes: parsed.data, ip: req.ip },
    });
    return reply.code(200).send(serializePlan(row!));
  });

  app.get("/admin/plans/:id/prices", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const existing = await getPlan(db, id);
    if (!existing) return reply.code(404).send({ error: "Plan not found" });
    const prices = await listPlanPrices(db, id);
    return reply.code(200).send({ prices: prices.map(serializePlanPrice) });
  });

  app.post("/admin/plans/:id/prices", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const parsed = planPriceCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { id } = req.params as { id: string };
    const existing = await getPlan(db, id);
    if (!existing) return reply.code(404).send({ error: "Plan not found" });
    let row;
    try {
      row = await setPlanPrice(db, { planId: id, amountCents: parsed.data.amountCents, effectiveFrom: parsed.data.effectiveFrom });
    } catch (err) {
      if (err instanceof PlanPriceOrderError) {
        return reply.code(409).send({ error: err.message, field: "effectiveFrom" });
      }
      throw err;
    }
    await audit(db, {
      actor: actor.id,
      action: "catalog.plan.price_change",
      target: { table: "subscription_plan_prices", id: row.id },
      payload: { plan_id: id, amount_cents: parsed.data.amountCents, effective_from: parsed.data.effectiveFrom, ip: req.ip },
    });
    return reply.code(201).send(serializePlanPrice(row));
  });
}
