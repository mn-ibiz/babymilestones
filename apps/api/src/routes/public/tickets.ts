import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  audit,
  events,
  eventTicketTiers,
  ticketOrders,
  tickets,
  type Database,
} from "@bm/db";
import { StubSmsSender } from "@bm/sms";
import {
  ticketCheckoutSchema,
  ticketRsvpSchema,
  type TicketOrderDto,
  type TicketDto,
} from "@bm/contracts";
import { generateTicketCode } from "./ticket-code.js";

export interface PublicTicketsDeps {
  db: Database;
  now?: () => Date;
}

type OrderRow = typeof ticketOrders.$inferSelect;
type TicketRow = typeof tickets.$inferSelect;

function toOrderDto(o: OrderRow): TicketOrderDto {
  return {
    id: o.id,
    eventId: o.eventId,
    tierId: o.tierId,
    buyerName: o.buyerName,
    buyerPhone: o.buyerPhone,
    buyerEmail: o.buyerEmail,
    quantity: o.quantity,
    amountCents: o.amountCents,
    status: o.status,
    provider: o.provider,
    paymentReference: o.paymentReference,
  };
}

function toTicketDto(t: TicketRow): TicketDto {
  return {
    id: t.id,
    code: t.code,
    eventId: t.eventId,
    tierId: t.tierId,
    buyerName: t.buyerName,
    buyerPhone: t.buyerPhone,
    status: t.status,
    checkedInAt: t.checkedInAt ? t.checkedInAt.toISOString() : null,
  };
}

/**
 * How many seats are already committed against a tier: issued tickets PLUS the
 * seats held by still-pending paid orders. A free RSVP issues immediately, so
 * its seats are counted via the tickets table; a pending paid order holds its
 * seats until it is paid or abandoned.
 */
async function committedSeats(db: Database, tierId: string): Promise<number> {
  const [issued] = await db
    .select({ n: sql<number>`count(*)` })
    .from(tickets)
    .where(and(eq(tickets.tierId, tierId), inArray(tickets.status, ["issued", "checked_in"])));
  const [pending] = await db
    .select({ n: sql<number>`coalesce(sum(${ticketOrders.quantity}), 0)` })
    .from(ticketOrders)
    .where(and(eq(ticketOrders.tierId, tierId), eq(ticketOrders.status, "pending")));
  return Number(issued?.n ?? 0) + Number(pending?.n ?? 0);
}

/** Build the one-time e-ticket / RSVP door link the SMS points at. */
function ticketLink(orderId: string): string {
  return `/t/${orderId}`;
}

/**
 * Public (unauthenticated) guest ticket checkout (30-3) + free RSVP (30-4).
 *
 *   POST /public/events/:id/checkout        — paid tier: create a pending order
 *                                             (provider mpesa|paystack). Tickets
 *                                             are issued on confirm.
 *   POST /public/ticket-orders/:id/confirm  — simulate the provider
 *                                             callback/webhook: mark paid + issue
 *                                             coded tickets + e-ticket SMS.
 *                                             Idempotent.
 *   POST /public/events/:id/rsvp            — free tier: issue tickets
 *                                             immediately + RSVP SMS.
 *
 * No account is created: the buyer's name/phone/(email) live on the order and
 * are denormalised onto every issued ticket so the door list / e-ticket needs
 * no login. Each issued seat gets a unique short door code (used by 30-5).
 */
export function registerPublicTickets(app: FastifyInstance, deps: PublicTicketsDeps): void {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  async function loadPublishedTier(eventId: string, tierId: string) {
    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.published, true)));
    if (!event || event.deletedAt) return null;
    const [tier] = await db
      .select()
      .from(eventTicketTiers)
      .where(and(eq(eventTicketTiers.id, tierId), eq(eventTicketTiers.eventId, eventId)));
    if (!tier) return null;
    return { event, tier };
  }

  // 30-3 AC1: create a pending paid order. Tickets issue on confirm (AC2).
  app.post("/public/events/:id/checkout", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id: eventId } = req.params as { id: string };
    const parsed = ticketCheckoutSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const data = parsed.data;

    const loaded = await loadPublishedTier(eventId, data.tierId);
    if (!loaded) return reply.code(404).send({ error: "Event not found" });
    const { tier } = loaded;

    if (tier.priceCents === 0) {
      return reply.code(400).send({ error: "This is a free tier — RSVP instead of paying", field: "tierId" });
    }

    const committed = await committedSeats(db, tier.id);
    if (committed + data.quantity > tier.allotment) {
      return reply.code(409).send({ error: "Not enough tickets left in this tier" });
    }

    const amountCents = tier.priceCents * data.quantity;
    const [order] = await db
      .insert(ticketOrders)
      .values({
        eventId,
        tierId: tier.id,
        buyerName: data.buyerName,
        buyerPhone: data.buyerPhone,
        buyerEmail: data.buyerEmail,
        quantity: data.quantity,
        amountCents,
        status: "pending",
        provider: data.provider,
      })
      .returning();
    if (!order) throw new Error("ticket order insert returned no row");

    await audit(db, {
      actor: null,
      action: "ticket.order.created",
      target: { table: "ticket_orders", id: order.id },
      payload: { event_id: eventId, tier_id: tier.id, quantity: data.quantity, provider: data.provider, ip: req.ip },
    });

    return reply.code(201).send({ order: toOrderDto(order) });
  });

  // 30-3 AC2: confirm a paid order → issue coded tickets + e-ticket SMS.
  // Idempotent: a re-confirm of an already-paid order returns its tickets.
  app.post(
    "/public/ticket-orders/:id/confirm",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id: orderId } = req.params as { id: string };
      const body = (req.body ?? {}) as { paymentReference?: string };

      const [order] = await db.select().from(ticketOrders).where(eq(ticketOrders.id, orderId));
      if (!order) return reply.code(404).send({ error: "Order not found" });

      if (order.status === "paid" || order.status === "free") {
        const existing = await db.select().from(tickets).where(eq(tickets.orderId, orderId));
        return reply.code(200).send({ order: toOrderDto(order), tickets: existing.map(toTicketDto) });
      }
      if (order.status === "cancelled") {
        return reply.code(409).send({ error: "Order was cancelled" });
      }

      const [event] = await db.select().from(events).where(eq(events.id, order.eventId));

      const issued = await db.transaction(async (tx) => {
        const rows = [] as TicketRow[];
        for (let i = 0; i < order.quantity; i += 1) {
          const [t] = await tx
            .insert(tickets)
            .values({
              code: generateTicketCode(),
              orderId: order.id,
              eventId: order.eventId,
              tierId: order.tierId,
              buyerName: order.buyerName,
              buyerPhone: order.buyerPhone,
              buyerEmail: order.buyerEmail,
              status: "issued",
            })
            .returning();
          if (t) rows.push(t);
        }
        await tx
          .update(ticketOrders)
          .set({
            status: "paid",
            paymentReference: body.paymentReference ?? order.paymentReference ?? null,
            updatedAt: now(),
          })
          .where(eq(ticketOrders.id, order.id));
        await audit(tx, {
          actor: null,
          action: "ticket.order.paid",
          target: { table: "ticket_orders", id: order.id },
          payload: { event_id: order.eventId, quantity: order.quantity, ip: req.ip },
        });
        return rows;
      });

      // E-ticket SMS-stub (AC2). Best-effort: a send failure must not undo the
      // already-committed issuance.
      try {
        await new StubSmsSender(db).send({
          to: order.buyerPhone,
          template: "event.eticket",
          data: {
            eventName: event?.name ?? "your event",
            quantity: String(order.quantity),
            link: ticketLink(order.id),
          },
        });
      } catch {
        // swallow — the tickets are issued; SMS is a stub side-channel.
      }

      const [updated] = await db.select().from(ticketOrders).where(eq(ticketOrders.id, order.id));
      return reply.code(200).send({ order: toOrderDto(updated!), tickets: issued.map(toTicketDto) });
    },
  );

  // 30-4 AC1/AC2/AC3: free RSVP — issue immediately + confirmation SMS.
  app.post("/public/events/:id/rsvp", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id: eventId } = req.params as { id: string };
    const parsed = ticketRsvpSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const data = parsed.data;

    const loaded = await loadPublishedTier(eventId, data.tierId);
    if (!loaded) return reply.code(404).send({ error: "Event not found" });
    const { event, tier } = loaded;

    if (tier.priceCents !== 0) {
      return reply.code(400).send({ error: "This tier is paid — use checkout", field: "tierId" });
    }

    const committed = await committedSeats(db, tier.id);
    if (committed + data.quantity > tier.allotment) {
      return reply.code(409).send({ error: "No spots left for this event" });
    }

    const { order, issued } = await db.transaction(async (tx) => {
      const [o] = await tx
        .insert(ticketOrders)
        .values({
          eventId,
          tierId: tier.id,
          buyerName: data.buyerName,
          buyerPhone: data.buyerPhone,
          buyerEmail: data.buyerEmail,
          quantity: data.quantity,
          amountCents: 0,
          status: "free",
        })
        .returning();
      if (!o) throw new Error("rsvp order insert returned no row");
      const rows = [] as TicketRow[];
      for (let i = 0; i < data.quantity; i += 1) {
        const [t] = await tx
          .insert(tickets)
          .values({
            code: generateTicketCode(),
            orderId: o.id,
            eventId,
            tierId: tier.id,
            buyerName: data.buyerName,
            buyerPhone: data.buyerPhone,
            buyerEmail: data.buyerEmail,
            status: "issued",
          })
          .returning();
        if (t) rows.push(t);
      }
      await audit(tx, {
        actor: null,
        action: "ticket.rsvp.created",
        target: { table: "ticket_orders", id: o.id },
        payload: { event_id: eventId, tier_id: tier.id, quantity: data.quantity, ip: req.ip },
      });
      return { order: o, issued: rows };
    });

    try {
      await new StubSmsSender(db).send({
        to: data.buyerPhone,
        template: "event.rsvp",
        data: {
          eventName: event.name,
          quantity: String(data.quantity),
          link: ticketLink(order.id),
        },
      });
    } catch {
      // swallow — RSVP is recorded; SMS is a stub side-channel.
    }

    return reply.code(201).send({ order: toOrderDto(order), tickets: issued.map(toTicketDto) });
  });
}
