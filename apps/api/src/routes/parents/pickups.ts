import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import {
  audit,
  childPickupAuthorisations,
  children,
  parents,
  users,
  type ChildPickupAuthorisationRow,
  type Database,
} from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import { pickupAuthorisationSchema, type PickupAuthorisation } from "@bm/contracts";
import type { ParentsDeps } from "./index.js";

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

/** Shape a persisted row into the API contract (timestamps → ISO strings). */
function toPickup(row: ChildPickupAuthorisationRow): PickupAuthorisation {
  return {
    id: row.id,
    childId: row.childId,
    name: row.name,
    phone: row.phone,
    relationship: row.relationship,
    photoUrl: row.photoUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Authorised pickup list per child (P2-E03-S01). The parent CRUDs (AC2) the list
 * of people who may collect a child — `name`, `phone`, optional `photoUrl`,
 * `relationship` (AC1). Ownership is derived server-side: the child must belong
 * to the session parent (else 404, never leaking another family's data), and the
 * pickup must belong to that child. Every create / edit / delete writes one audit
 * row (AC3) in the SAME transaction as the mutation (outbox pattern). Mutating
 * verbs require the CSRF double-submit token.
 *
 *  GET    /parents/me/children/:childId/pickups
 *  POST   /parents/me/children/:childId/pickups
 *  PATCH  /parents/me/children/:childId/pickups/:pickupId
 *  DELETE /parents/me/children/:childId/pickups/:pickupId
 */
export function registerParentPickups(app: FastifyInstance, deps: ParentsDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  /**
   * Resolve the session and the owned child in one place. Returns the parent
   * profile id + the acting user id, or sends the appropriate error reply.
   */
  async function authParentChild(
    req: FastifyRequest,
    reply: FastifyReply,
    childId: string,
  ): Promise<{ parentId: string; userId: string } | null> {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    const [profile] = await db.select().from(parents).where(eq(parents.userId, auth.user.id));
    if (!profile) {
      reply.code(404).send({ error: "Parent profile not found" });
      return null;
    }
    // The child must belong to this parent and not be archived (never expose
    // another family's child, and never CRUD a deleted one).
    const [child] = await db.select().from(children).where(eq(children.id, childId));
    if (!child || child.parentId !== profile.id || child.archivedAt !== null) {
      reply.code(404).send({ error: "Child not found" });
      return null;
    }
    return { parentId: profile.id, userId: auth.user.id };
  }

  // List a child's authorised pickups (AC1, AC2). Read-only — no CSRF needed.
  app.get(
    "/parents/me/children/:childId/pickups",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { childId } = req.params as { childId: string };
      const ctx = await authParentChild(req, reply, childId);
      if (!ctx) return reply;
      const rows = await db
        .select()
        .from(childPickupAuthorisations)
        .where(eq(childPickupAuthorisations.childId, childId))
        .orderBy(desc(childPickupAuthorisations.createdAt));
      return reply.code(200).send({ pickups: rows.map(toPickup) });
    },
  );

  // Create an authorised pickup (AC1, AC2). Audited (AC3).
  app.post(
    "/parents/me/children/:childId/pickups",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { childId } = req.params as { childId: string };
      const ctx = await authParentChild(req, reply, childId);
      if (!ctx) return reply;

      const parsed = pickupAuthorisationSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
      }
      const { name, phone, relationship, photoUrl } = parsed.data;

      const row = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(childPickupAuthorisations)
          .values({ childId, name, phone, relationship, photoUrl })
          .returning();
        await audit(tx, {
          actor: ctx.userId,
          action: "pickup.created",
          target: { table: "child_pickup_authorisations", id: created!.id },
          payload: { child_id: childId, name, relationship, ip: req.ip },
        });
        return created!;
      });
      return reply.code(201).send({ pickup: toPickup(row) });
    },
  );

  // Edit an authorised pickup (AC2). Audited (AC3).
  app.patch(
    "/parents/me/children/:childId/pickups/:pickupId",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { childId, pickupId } = req.params as { childId: string; pickupId: string };
      const ctx = await authParentChild(req, reply, childId);
      if (!ctx) return reply;

      const parsed = pickupAuthorisationSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
      }
      const { name, phone, relationship, photoUrl } = parsed.data;

      // The existence + ownership check, the update, and the audit all run in
      // ONE transaction so a concurrent delete can't slip between them (no audit
      // of a no-op, no empty `.returning()`). The pickup must belong to THIS
      // child (ownership is doubly fenced — child→parent above, pickup→child here).
      const row = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(childPickupAuthorisations)
          .where(
            and(
              eq(childPickupAuthorisations.id, pickupId),
              eq(childPickupAuthorisations.childId, childId),
            ),
          );
        if (!existing) return null;
        const [updated] = await tx
          .update(childPickupAuthorisations)
          .set({ name, phone, relationship, photoUrl, updatedAt: new Date() })
          .where(eq(childPickupAuthorisations.id, pickupId))
          .returning();
        await audit(tx, {
          actor: ctx.userId,
          action: "pickup.updated",
          target: { table: "child_pickup_authorisations", id: pickupId },
          payload: { child_id: childId, name, relationship, ip: req.ip },
        });
        return updated!;
      });
      if (!row) return reply.code(404).send({ error: "Pickup not found" });
      return reply.code(200).send({ pickup: toPickup(row) });
    },
  );

  // Delete an authorised pickup (AC2). Audited (AC3).
  app.delete(
    "/parents/me/children/:childId/pickups/:pickupId",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { childId, pickupId } = req.params as { childId: string; pickupId: string };
      const ctx = await authParentChild(req, reply, childId);
      if (!ctx) return reply;

      // Existence + ownership check, the delete, and the audit run in ONE
      // transaction (no audit of a no-op under a concurrent delete).
      const deleted = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(childPickupAuthorisations)
          .where(
            and(
              eq(childPickupAuthorisations.id, pickupId),
              eq(childPickupAuthorisations.childId, childId),
            ),
          );
        if (!existing) return false;
        await tx.delete(childPickupAuthorisations).where(eq(childPickupAuthorisations.id, pickupId));
        await audit(tx, {
          actor: ctx.userId,
          action: "pickup.deleted",
          target: { table: "child_pickup_authorisations", id: pickupId },
          payload: { child_id: childId, ip: req.ip },
        });
        return true;
      });
      if (!deleted) return reply.code(404).send({ error: "Pickup not found" });
      return reply.code(200).send({ ok: true, id: pickupId });
    },
  );
}
