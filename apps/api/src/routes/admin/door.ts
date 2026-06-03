import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import {
  audit,
  events,
  eventTicketTiers,
  tickets,
  users,
  type Database,
} from "@bm/db";
import {
  validateSession,
  can,
  CSRF_HEADER_NAME,
  type PermissionPrincipal,
} from "@bm/auth";
import type { SessionStore } from "@bm/auth";
import { ticketCheckInSchema, type DoorListResponse, type DoorListTicket } from "@bm/contracts";

export interface DoorDeps {
  db: Database;
  sessions: SessionStore;
  now?: () => Date;
}

function csrfHeaderOf(req: FastifyRequest): string | null {
  const raw = req.headers[CSRF_HEADER_NAME];
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

/**
 * Door check-in (P4-E05-S05). Staff-gated (`manage service` — admin/super_admin,
 * mirroring the event admin). Lists sold tickets for an event with search by
 * name/phone/code (AC1), marks a ticket checked-in with a double-scan guard
 * (AC2), and exposes a capacity-vs-checked-in counter (AC3). Browser-camera
 * scanning is deferred to P5 polish (AC4) — the code field accepts a typed or
 * pasted code.
 */
export function registerDoorCheckIn(app: FastifyInstance, deps: DoorDeps): void {
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

  // AC1 + AC3: door list for an event, optional `q` search by name/phone/code,
  // with the capacity-vs-checked-in counter.
  app.get("/admin/events/:id/door", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const { id: eventId } = req.params as { id: string };
    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (!event) return reply.code(404).send({ error: "Event not found" });

    const q = (req.query as { q?: string }).q?.trim();
    const filters = [eq(tickets.eventId, eventId)];
    if (q) {
      const like = `%${q}%`;
      filters.push(
        or(
          ilike(tickets.buyerName, like),
          ilike(tickets.buyerPhone, like),
          ilike(tickets.code, like),
        )!,
      );
    }

    const rows = await db
      .select({
        id: tickets.id,
        code: tickets.code,
        buyerName: tickets.buyerName,
        buyerPhone: tickets.buyerPhone,
        status: tickets.status,
        checkedInAt: tickets.checkedInAt,
        tierName: eventTicketTiers.name,
      })
      .from(tickets)
      .innerJoin(eventTicketTiers, eq(tickets.tierId, eventTicketTiers.id))
      .where(and(...filters))
      .orderBy(asc(tickets.buyerName));

    // Counters are over ALL of the event's tickets, not the filtered view.
    const [counts] = await db
      .select({
        total: sql<number>`count(*)`,
        checkedIn: sql<number>`count(*) filter (where ${tickets.status} = 'checked_in')`,
      })
      .from(tickets)
      .where(eq(tickets.eventId, eventId));

    const list: DoorListTicket[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      buyerName: r.buyerName,
      buyerPhone: r.buyerPhone,
      tierName: r.tierName,
      status: r.status,
      checkedInAt: r.checkedInAt ? r.checkedInAt.toISOString() : null,
    }));

    const response: DoorListResponse = {
      eventId,
      eventName: event.name,
      total: Number(counts?.total ?? 0),
      checkedIn: Number(counts?.checkedIn ?? 0),
      tickets: list,
    };
    return reply.code(200).send(response);
  });

  // AC2: mark a ticket checked in by its code; double-scan blocked (409).
  app.post("/admin/events/:id/door/check-in", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const { id: eventId } = req.params as { id: string };
    const parsed = ticketCheckInSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.code, parsed.data.code), eq(tickets.eventId, eventId)));
    if (!ticket) return reply.code(404).send({ error: "Ticket not found for this event" });

    if (ticket.status === "cancelled") {
      return reply.code(409).send({ error: "Ticket was cancelled", status: ticket.status });
    }
    if (ticket.status === "checked_in") {
      return reply.code(409).send({
        error: "Ticket already checked in",
        status: ticket.status,
        checkedInAt: ticket.checkedInAt ? ticket.checkedInAt.toISOString() : null,
      });
    }

    // Gate the transition on the ticket STILL being 'issued' so two concurrent
    // scans of the same code can't both admit it (the read-side guard above is not
    // atomic). The loser matches 0 rows and is reported as already-checked-in.
    const [updated] = await db
      .update(tickets)
      .set({ status: "checked_in", checkedInAt: now(), checkedInBy: actor.id })
      .where(and(eq(tickets.id, ticket.id), eq(tickets.status, "issued")))
      .returning();
    if (!updated) {
      const [current] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
      return reply.code(409).send({
        error: current?.status === "checked_in" ? "Ticket already checked in" : "Ticket not admittable",
        status: current?.status ?? "unknown",
        checkedInAt: current?.checkedInAt ? current.checkedInAt.toISOString() : null,
      });
    }

    await audit(db, {
      actor: actor.id,
      action: "ticket.checked_in",
      target: { table: "tickets", id: updated.id },
      payload: { event_id: eventId, code: updated.code, ip: req.ip },
    });

    return reply.code(200).send({
      ticket: {
        id: updated.id,
        code: updated.code,
        buyerName: updated.buyerName,
        status: updated.status,
        checkedInAt: updated.checkedInAt ? updated.checkedInAt.toISOString() : null,
      },
    });
  });
}
