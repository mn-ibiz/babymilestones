import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, isNull, inArray } from "drizzle-orm";
import { audit, events, eventTicketTiers, users, type Database } from "@bm/db";
import {
  validateSession,
  can,
  CSRF_HEADER_NAME,
  type PermissionPrincipal,
} from "@bm/auth";
import type { SessionStore } from "@bm/auth";
import type { EventDto } from "@bm/contracts";
import { z } from "zod";
import { uniqueSlug } from "./events-slug.js";

export interface AdminEventsDeps {
  db: Database;
  sessions: SessionStore;
  now?: () => Date;
}

function csrfHeaderOf(req: FastifyRequest): string | null {
  const raw = req.headers[CSRF_HEADER_NAME];
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

const tierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  priceCents: z.number().int().min(0),
  allotment: z.number().int().min(0),
  saleStartsAt: z.string().datetime({ offset: true }).optional(),
  saleEndsAt: z.string().datetime({ offset: true }).optional(),
});

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).optional(),
    unit: z.enum(["reading_corner", "talent_recital", "general"]).default("general"),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    venue: z.string().trim().max(200).optional(),
    capacity: z.number().int().min(0),
    published: z.boolean().default(false),
    tiers: z.array(tierSchema).min(1).max(20),
  })
  .refine((d) => new Date(d.endsAt).getTime() >= new Date(d.startsAt).getTime(), {
    message: "endsAt must be on or after startsAt",
    path: ["endsAt"],
  });

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  unit: z.enum(["reading_corner", "talent_recital", "general"]).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  venue: z.string().trim().max(200).nullable().optional(),
  capacity: z.number().int().min(0).optional(),
  published: z.boolean().optional(),
});

type EventRow = typeof events.$inferSelect;
type TierRow = typeof eventTicketTiers.$inferSelect;

function toTierDto(t: TierRow) {
  return {
    id: t.id,
    eventId: t.eventId,
    name: t.name,
    priceCents: t.priceCents,
    allotment: t.allotment,
    saleStartsAt: t.saleStartsAt ? t.saleStartsAt.toISOString() : null,
    saleEndsAt: t.saleEndsAt ? t.saleEndsAt.toISOString() : null,
  };
}

function toEventDto(e: EventRow, tiers: TierRow[]): EventDto {
  return {
    id: e.id,
    name: e.name,
    slug: e.slug,
    description: e.description,
    unit: e.unit as EventDto["unit"],
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    venue: e.venue,
    capacity: e.capacity,
    published: e.published,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    tiers: tiers.map(toTierDto),
  };
}

/**
 * Admin event + ticket-tier CRUD (P4-E05-S01). Events are treated as service
 * configuration, so the guard is `manage service` (admin / super_admin) — the
 * same gate the subscription-plan admin uses. Every mutation writes an audit
 * row; the acting user is the session user, never the client. Events
 * soft-delete via `deleted_at`.
 */
export function registerAdminEvents(app: FastifyInstance, deps: AdminEventsDeps): void {
  const { db, sessions } = deps;
  const now = deps.now ?? (() => new Date());
  const resolveUser = async (userId: string) => {
    const [u] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, userId));
    return u ? { id: u.id, role: u.role } : null;
  };

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

  async function loadTiers(eventIds: string[]): Promise<Map<string, TierRow[]>> {
    const byEvent = new Map<string, TierRow[]>();
    if (eventIds.length === 0) return byEvent;
    const tiers = await db
      .select()
      .from(eventTicketTiers)
      .where(inArray(eventTicketTiers.eventId, eventIds));
    for (const t of tiers) {
      const arr = byEvent.get(t.eventId) ?? [];
      arr.push(t);
      byEvent.set(t.eventId, arr);
    }
    return byEvent;
  }

  app.post("/admin/events", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const data = parsed.data;

    // Unique slug against ALL rows (including soft-deleted) so we never collide
    // on the unique index.
    const existing = await db.select({ slug: events.slug }).from(events);
    const slug = uniqueSlug(data.name, new Set(existing.map((r) => r.slug)));

    const event = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(events)
        .values({
          name: data.name,
          slug,
          description: data.description ?? null,
          unit: data.unit,
          startsAt: new Date(data.startsAt),
          endsAt: new Date(data.endsAt),
          venue: data.venue ?? null,
          capacity: data.capacity,
          published: data.published,
          createdBy: actor.id,
        })
        .returning();

      const tierRows = await tx
        .insert(eventTicketTiers)
        .values(
          data.tiers.map((t) => ({
            eventId: row.id,
            name: t.name,
            priceCents: t.priceCents,
            allotment: t.allotment,
            saleStartsAt: t.saleStartsAt ? new Date(t.saleStartsAt) : null,
            saleEndsAt: t.saleEndsAt ? new Date(t.saleEndsAt) : null,
          })),
        )
        .returning();

      return toEventDto(row, tierRows);
    });

    await audit(db, {
      actor: actor.id,
      action: "event.created",
      target: { table: "events", id: event.id },
      payload: { name: event.name, slug: event.slug, capacity: event.capacity, ip: req.ip },
    });

    return reply.code(201).send({ event });
  });

  app.get("/admin/events", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const rows = await db
      .select()
      .from(events)
      .where(isNull(events.deletedAt))
      .orderBy(desc(events.startsAt));
    const byEvent = await loadTiers(rows.map((e) => e.id));
    return reply.code(200).send({
      events: rows.map((e) => toEventDto(e, byEvent.get(e.id) ?? [])),
    });
  });

  app.get("/admin/events/:id", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const { id } = req.params as { id: string };
    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)));
    if (!event) return reply.code(404).send({ error: "Event not found" });

    const tiers = await db
      .select()
      .from(eventTicketTiers)
      .where(eq(eventTicketTiers.eventId, id));
    return reply.code(200).send({ event: toEventDto(event, tiers) });
  });

  app.patch("/admin/events/:id", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { id } = req.params as { id: string };
    const data = parsed.data;

    const [current] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)));
    if (!current) return reply.code(404).send({ error: "Event not found" });

    const nextStart = data.startsAt ? new Date(data.startsAt) : current.startsAt;
    const nextEnd = data.endsAt ? new Date(data.endsAt) : current.endsAt;
    if (nextEnd.getTime() < nextStart.getTime()) {
      return reply.code(400).send({ error: "endsAt must be on or after startsAt", field: "endsAt" });
    }

    const updates: Partial<EventRow> = { updatedAt: now() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.unit !== undefined) updates.unit = data.unit;
    if (data.startsAt !== undefined) updates.startsAt = nextStart;
    if (data.endsAt !== undefined) updates.endsAt = nextEnd;
    if (data.venue !== undefined) updates.venue = data.venue;
    if (data.capacity !== undefined) updates.capacity = data.capacity;
    if (data.published !== undefined) updates.published = data.published;

    const [row] = await db
      .update(events)
      .set(updates)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .returning();

    const tiers = await db
      .select()
      .from(eventTicketTiers)
      .where(eq(eventTicketTiers.eventId, id));

    await audit(db, {
      actor: actor.id,
      action: "event.updated",
      target: { table: "events", id },
      payload: { fields: Object.keys(updates), ip: req.ip },
    });

    if (data.published !== undefined && data.published !== current.published) {
      await audit(db, {
        actor: actor.id,
        action: data.published ? "event.published" : "event.unpublished",
        target: { table: "events", id },
        payload: { ip: req.ip },
      });
    }

    return reply.code(200).send({ event: toEventDto(row, tiers) });
  });

  app.delete("/admin/events/:id", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const { id } = req.params as { id: string };
    const [row] = await db
      .update(events)
      .set({ deletedAt: now(), published: false })
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .returning();
    if (!row) return reply.code(404).send({ error: "Event not found" });

    await audit(db, {
      actor: actor.id,
      action: "event.deleted",
      target: { table: "events", id },
      payload: { ip: req.ip },
    });

    return reply.code(200).send({ event: { id: row.id, deleted: true } });
  });
}
