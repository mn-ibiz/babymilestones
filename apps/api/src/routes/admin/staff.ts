import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import { staffCreateSchema, staffUpdateSchema } from "@bm/contracts";
import { createStaff, getStaff, listStaff, setStaffActive, updateStaff } from "@bm/catalog";
import type { SessionStore } from "@bm/auth";
import type { AttributionRole } from "@bm/db";

export interface AdminStaffDeps {
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

/** Public shape of a staff row. */
function serializeStaff(row: Awaited<ReturnType<typeof getStaff>>) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.displayName,
    role: row.role,
    active: row.active,
    terminatedAt: row.terminatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Staff data-record administration (P1-E07-S03). Staff are people bookings get
 * attributed to — NOT login accounts (no auth association). All routes are
 * reserved to roles holding `manage service` (admin / super_admin).
 *
 *   GET    /admin/staff            — list (newest first; ?activeOnly=1 ; ?role=stylist)
 *   POST   /admin/staff            — create a staff member (AC1/AC2)
 *   GET    /admin/staff/:id        — read one
 *   PATCH  /admin/staff/:id        — rename / change role / soft-deactivate (AC2/AC4)
 *
 * Every mutation writes an `audit_outbox` row (DoD #4). The acting user is the
 * session user — never accepted from the client. A rename mutates only the live
 * row; booking attribution history keeps its name-at-time snapshot (AC4), so this
 * route never retroactively rewrites past bookings.
 */
export function registerAdminStaff(app: FastifyInstance, deps: AdminStaffDeps): void {
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

  // List staff.
  app.get("/admin/staff", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { activeOnly, role } = (req.query ?? {}) as { activeOnly?: string; role?: string };
    const rows = await listStaff(db, {
      activeOnly: activeOnly === "1" || activeOnly === "true",
      ...(role ? { role: role as AttributionRole } : {}),
    });
    return reply.code(200).send({ staff: rows.map(serializeStaff) });
  });

  // Create a staff member (AC1/AC2).
  app.post("/admin/staff", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const parsed = staffCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const row = await createStaff(db, parsed.data);
    await audit(db, {
      actor: actor.id,
      action: "catalog.staff.create",
      target: { table: "staff", id: row.id },
      payload: { display_name: parsed.data.displayName, role: parsed.data.role, ip: req.ip },
    });
    return reply.code(201).send(serializeStaff(row));
  });

  // Read one.
  app.get("/admin/staff/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const row = await getStaff(db, id);
    if (!row) return reply.code(404).send({ error: "Staff not found" });
    return reply.code(200).send(serializeStaff(row));
  });

  // Update (partial). Rename / role change / soft-deactivate via active (AC2/AC4).
  app.patch("/admin/staff/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const parsed = staffUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { id } = req.params as { id: string };
    const existing = await getStaff(db, id);
    if (!existing) return reply.code(404).send({ error: "Staff not found" });

    const { active, ...fields } = parsed.data;
    let row = existing;
    // displayName / role are a live-row patch — never rewrites attribution history.
    if (fields.displayName !== undefined || fields.role !== undefined) {
      row = (await updateStaff(db, id, fields)) ?? row;
    }
    // active toggles soft-retirement (stamps/clears terminatedAt) — no hard delete.
    if (active !== undefined && active !== row.active) {
      row = (await setStaffActive(db, id, active)) ?? row;
    }
    await audit(db, {
      actor: actor.id,
      action: "catalog.staff.update",
      target: { table: "staff", id },
      payload: { changes: parsed.data, ip: req.ip },
    });
    return reply.code(200).send(serializeStaff(row));
  });
}
