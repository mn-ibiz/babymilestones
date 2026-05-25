import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import { serviceCreateSchema, serviceUpdateSchema, servicePriceCreateSchema } from "@bm/contracts";
import {
  createService,
  getService,
  listServicePrices,
  listServices,
  setServicePrice,
  updateService,
  ServicePriceOrderError,
} from "@bm/catalog";
import type { SessionStore } from "@bm/auth";

export interface AdminServicesDeps {
  db: Database;
  sessions: SessionStore;
}

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

/** Public shape of a service row. */
function serializeService(row: Awaited<ReturnType<typeof getService>>) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    unit: row.unit,
    isActive: row.isActive,
    attributionRoleRequired: row.attributionRoleRequired,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Public shape of a price row. */
function serializePrice(row: {
  id: string;
  serviceId: string;
  amountCents: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    serviceId: row.serviceId,
    amountCents: row.amountCents,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdAt: row.createdAt,
  };
}

/**
 * Service catalogue + effective-dated price administration (P1-E07-S01). All
 * routes are reserved to roles holding `manage service` (admin / super_admin).
 *
 *   GET    /admin/services                 — list (newest first; ?activeOnly=1)
 *   POST   /admin/services                 — create a service (AC1)
 *   GET    /admin/services/:id             — read one
 *   PATCH  /admin/services/:id             — update; soft-delete via isActive (AC1)
 *   GET    /admin/services/:id/prices      — full effective-dated price history
 *   POST   /admin/services/:id/prices      — set a new price; closes old row (AC2/AC3)
 *
 * Every mutation writes an `audit_outbox` row (AC5). The acting user is the
 * session user — never accepted from the client.
 */
export function registerAdminServices(app: FastifyInstance, deps: AdminServicesDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

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
    if (!can(auth.user.role, "manage", "service")) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  // List services.
  app.get("/admin/services", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { activeOnly } = (req.query ?? {}) as { activeOnly?: string };
    const rows = await listServices(db, { activeOnly: activeOnly === "1" || activeOnly === "true" });
    return reply.code(200).send({ services: rows.map(serializeService) });
  });

  // Create a service (AC1).
  app.post("/admin/services", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const parsed = serviceCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const row = await createService(db, parsed.data);
    await audit(db, {
      actor: actor.id,
      action: "catalog.service.create",
      target: { table: "services", id: row.id },
      payload: { name: parsed.data.name, unit: parsed.data.unit, ip: req.ip },
    });
    return reply.code(201).send(serializeService(row));
  });

  // Read one.
  app.get("/admin/services/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const row = await getService(db, id);
    if (!row) return reply.code(404).send({ error: "Service not found" });
    return reply.code(200).send(serializeService(row));
  });

  // Update (partial). Soft-delete via isActive=false (AC1).
  app.patch("/admin/services/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const parsed = serviceUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { id } = req.params as { id: string };
    const existing = await getService(db, id);
    if (!existing) return reply.code(404).send({ error: "Service not found" });
    const row = await updateService(db, id, parsed.data);
    await audit(db, {
      actor: actor.id,
      action: "catalog.service.update",
      target: { table: "services", id },
      payload: { changes: parsed.data, ip: req.ip },
    });
    return reply.code(200).send(serializeService(row));
  });

  // Full effective-dated price history.
  app.get("/admin/services/:id/prices", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const existing = await getService(db, id);
    if (!existing) return reply.code(404).send({ error: "Service not found" });
    const prices = await listServicePrices(db, id);
    return reply.code(200).send({ prices: prices.map(serializePrice) });
  });

  // Set a new effective-dated price — closes the old open row, inserts a new one (AC2/AC3).
  app.post("/admin/services/:id/prices", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const parsed = servicePriceCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { id } = req.params as { id: string };
    const existing = await getService(db, id);
    if (!existing) return reply.code(404).send({ error: "Service not found" });
    let row;
    try {
      row = await setServicePrice(db, {
        serviceId: id,
        amountCents: parsed.data.amountCents,
        effectiveFrom: parsed.data.effectiveFrom,
      });
    } catch (err) {
      if (err instanceof ServicePriceOrderError) {
        // A new price must start after the current one — never overwrite/backdate.
        return reply.code(409).send({ error: err.message, field: "effectiveFrom" });
      }
      throw err;
    }
    await audit(db, {
      actor: actor.id,
      action: "catalog.service.price_change",
      target: { table: "service_prices", id: row.id },
      payload: {
        service_id: id,
        amount_cents: parsed.data.amountCents,
        effective_from: parsed.data.effectiveFrom,
        ip: req.ip,
      },
    });
    return reply.code(201).send(serializePrice(row));
  });
}
