import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  audit,
  children,
  parents,
  users,
  type ChildRow,
  type Database,
} from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import { ageInMonths, childSchema, photoConsentSchema, type Child } from "@bm/contracts";
import type { ParentsDeps } from "./index.js";

/** Map a stored row to the API/contract shape (with derived age — AC2). */
function toChild(row: ChildRow): Child {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    allergiesNotes: row.allergiesNotes,
    photoConsent: row.photoConsent,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    ageInMonths: ageInMonths(row.dateOfBirth),
  };
}

/** Resolve a session userId to its live id+role. */
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
 * Children registry routes (P1-E02-S03). All scoped to the authenticated
 * parent — ownership is derived from the session, never the request body, so a
 * parent can only ever see/edit/archive their OWN children.
 *
 * - GET    /parents/me/children            → the parent's children (incl. derived age; AC2)
 * - POST   /parents/me/children            → add a child (AC1); audited child.created (AC5)
 * - PUT    /parents/me/children/:id        → edit, all fields preserved (AC3); audited child.updated (AC5)
 * - DELETE /parents/me/children/:id        → soft-delete via archived_at (AC4); audited child.archived (AC5)
 *
 * Mutating verbs require the CSRF double-submit token.
 */
export function registerParentChildren(app: FastifyInstance, { db, sessions }: ParentsDeps): void {
  const resolveUser = makeResolveUser(db);

  /** Authenticate + resolve the caller's parent profile id. Replies on failure. */
  async function requireParent(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ userId: string; parentId: string } | null> {
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
      // No parent profile yet → nothing to own children under (AC: ownership).
      reply.code(404).send({ error: "Parent profile not found" });
      return null;
    }
    return { userId: auth.user.id, parentId: profile.id };
  }

  app.get("/parents/me/children", async (req, reply) => {
    const ctx = await requireParent(req, reply);
    if (!ctx) return;
    const rows = await db.select().from(children).where(eq(children.parentId, ctx.parentId));
    return reply.code(200).send({ children: rows.map(toChild) });
  });

  app.post("/parents/me/children", async (req, reply) => {
    const ctx = await requireParent(req, reply);
    if (!ctx) return;

    const parsed = childSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid child", field: first?.path[0] });
    }
    const input = parsed.data;

    const child = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(children)
        .values({
          parentId: ctx.parentId,
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          allergiesNotes: input.allergiesNotes,
        })
        .returning();
      await audit(tx, {
        actor: ctx.userId,
        action: "child.created",
        target: { table: "children", id: created!.id },
        payload: { ip: req.ip, user_agent: req.headers["user-agent"] ?? null },
      });
      return toChild(created!);
    });

    return reply.code(201).send({ child });
  });

  app.put<{ Params: { id: string } }>("/parents/me/children/:id", async (req, reply) => {
    const ctx = await requireParent(req, reply);
    if (!ctx) return;

    const parsed = childSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid child", field: first?.path[0] });
    }
    const input = parsed.data;
    const childId = req.params.id;

    const result = await db.transaction(async (tx) => {
      // Ownership: scope the update to (id AND parentId) so a parent can never
      // touch another parent's child.
      const [existing] = await tx
        .select()
        .from(children)
        .where(and(eq(children.id, childId), eq(children.parentId, ctx.parentId)));
      if (!existing) return null;

      const [updated] = await tx
        .update(children)
        .set({
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          allergiesNotes: input.allergiesNotes,
          updatedAt: new Date(),
        })
        .where(and(eq(children.id, childId), eq(children.parentId, ctx.parentId)))
        .returning();
      await audit(tx, {
        actor: ctx.userId,
        action: "child.updated",
        target: { table: "children", id: childId },
        payload: { ip: req.ip, user_agent: req.headers["user-agent"] ?? null },
      });
      return toChild(updated!);
    });

    if (!result) return reply.code(404).send({ error: "Child not found" });
    return reply.code(200).send({ child: result });
  });

  app.delete<{ Params: { id: string } }>("/parents/me/children/:id", async (req, reply) => {
    const ctx = await requireParent(req, reply);
    if (!ctx) return;
    const childId = req.params.id;

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(children)
        .where(and(eq(children.id, childId), eq(children.parentId, ctx.parentId)));
      if (!existing) return null;

      // AC4: soft-delete — set archived_at, never hard-delete (historical
      // bookings stay intact). Idempotent: re-archiving keeps the first stamp.
      const archivedAt = existing.archivedAt ?? new Date();
      const [updated] = await tx
        .update(children)
        .set({ archivedAt, updatedAt: new Date() })
        .where(and(eq(children.id, childId), eq(children.parentId, ctx.parentId)))
        .returning();
      await audit(tx, {
        actor: ctx.userId,
        action: "child.archived",
        target: { table: "children", id: childId },
        payload: { ip: req.ip, user_agent: req.headers["user-agent"] ?? null },
      });
      return toChild(updated!);
    });

    if (!result) return reply.code(404).send({ error: "Child not found" });
    return reply.code(200).send({ child: result });
  });

  // POST /parents/me/children/:id/restore — undo a soft-delete by clearing
  // archived_at (P1-E11-S02 AC3). Ownership-scoped; audited child.restored.
  app.post<{ Params: { id: string } }>("/parents/me/children/:id/restore", async (req, reply) => {
    const ctx = await requireParent(req, reply);
    if (!ctx) return;
    const childId = req.params.id;

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(children)
        .where(and(eq(children.id, childId), eq(children.parentId, ctx.parentId)));
      if (!existing) return null;

      const [updated] = await tx
        .update(children)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(and(eq(children.id, childId), eq(children.parentId, ctx.parentId)))
        .returning();
      await audit(tx, {
        actor: ctx.userId,
        action: "child.restored",
        target: { table: "children", id: childId },
        payload: { ip: req.ip, user_agent: req.headers["user-agent"] ?? null },
      });
      return toChild(updated!);
    });

    if (!result) return reply.code(404).send({ error: "Child not found" });
    return reply.code(200).send({ child: result });
  });

  // PUT /parents/me/children/:id/consent/photo — toggle a child's photo consent
  // (P1-E02-S04 AC1, AC2). Ownership-scoped like every other child verb; the
  // change is audited with a timestamp (AC2).
  app.put<{ Params: { id: string } }>(
    "/parents/me/children/:id/consent/photo",
    async (req, reply) => {
      const ctx = await requireParent(req, reply);
      if (!ctx) return;

      const parsed = photoConsentSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return reply
          .code(400)
          .send({ error: first?.message ?? "Invalid consent", field: first?.path[0] });
      }
      const { photoConsent } = parsed.data;
      const childId = req.params.id;

      const result = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(children)
          .where(and(eq(children.id, childId), eq(children.parentId, ctx.parentId)));
        if (!existing) return null;

        const [updated] = await tx
          .update(children)
          .set({ photoConsent, updatedAt: new Date() })
          .where(and(eq(children.id, childId), eq(children.parentId, ctx.parentId)))
          .returning();
        await audit(tx, {
          actor: ctx.userId,
          action: "child.consent.photo",
          target: { table: "children", id: childId },
          payload: {
            photo_consent: photoConsent,
            at: new Date().toISOString(),
            ip: req.ip,
            user_agent: req.headers["user-agent"] ?? null,
          },
        });
        return toChild(updated!);
      });

      if (!result) return reply.code(404).send({ error: "Child not found" });
      return reply.code(200).send({ child: result });
    },
  );
}
