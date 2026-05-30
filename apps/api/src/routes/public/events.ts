import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, asc, eq, gte, isNull, inArray, sql } from "drizzle-orm";
import { events, eventTicketTiers, tickets, type Database } from "@bm/db";
import type { PublicEventDto, PublicEventTierDto, EventUnit } from "@bm/contracts";

export interface PublicEventsDeps {
  db: Database;
  now?: () => Date;
}

type EventRow = typeof events.$inferSelect;
type TierRow = typeof eventTicketTiers.$inferSelect;

/**
 * Map a tier row to its public view. `sold` is the number of issued seats (paid
 * tickets + free RSVPs, story 30-3/30-4); `remaining` is the allotment minus
 * that. Sold-out tiers are flagged, not hidden (30-2 AC2).
 */
function toPublicTierDto(tier: TierRow, sold: number): PublicEventTierDto {
  const remaining = Math.max(0, tier.allotment - sold);
  return {
    id: tier.id,
    name: tier.name,
    priceCents: tier.priceCents,
    allotment: tier.allotment,
    sold,
    remaining,
    soldOut: remaining <= 0,
    isFree: tier.priceCents === 0,
  };
}

function toPublicEventDto(
  event: EventRow,
  tiers: TierRow[],
  soldByTier: Map<string, number>,
): PublicEventDto {
  return {
    id: event.id,
    name: event.name,
    slug: event.slug,
    description: event.description,
    unit: event.unit as EventUnit,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    venue: event.venue,
    capacity: event.capacity,
    tiers: tiers.map((t) => toPublicTierDto(t, soldByTier.get(t.id) ?? 0)),
  };
}

/**
 * Public (unauthenticated) event browsing (P4-E05-S02). Exposes only published,
 * non-deleted, upcoming events with per-tier remaining capacity. No auth: this
 * is the storefront grandparents/guests hit before any account exists. Detail is
 * addressable by SEO-friendly slug or id (AC3).
 */
export function registerPublicEvents(app: FastifyInstance, deps: PublicEventsDeps): void {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

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

  /** Issued (non-cancelled) seat count per tier, keyed by tier id. */
  async function loadSoldByTier(tierIds: string[]): Promise<Map<string, number>> {
    const sold = new Map<string, number>();
    if (tierIds.length === 0) return sold;
    const rows = await db
      .select({ tierId: tickets.tierId, n: sql<number>`count(*)` })
      .from(tickets)
      .where(and(inArray(tickets.tierId, tierIds), inArray(tickets.status, ["issued", "checked_in"])))
      .groupBy(tickets.tierId);
    for (const r of rows) sold.set(r.tierId, Number(r.n));
    return sold;
  }

  // List published, non-deleted, upcoming events (AC1), ordered by start.
  app.get("/public/events", async (req: FastifyRequest, reply) => {
    const includePast = (req.query as { include_past?: string }).include_past;
    const wantPast = includePast === "1" || includePast === "true";
    const where = wantPast
      ? and(eq(events.published, true), isNull(events.deletedAt))
      : and(
          eq(events.published, true),
          isNull(events.deletedAt),
          gte(events.endsAt, now()),
        );
    const rows = await db.select().from(events).where(where).orderBy(asc(events.startsAt));
    const byEvent = await loadTiers(rows.map((e) => e.id));
    const allTierIds = [...byEvent.values()].flat().map((t) => t.id);
    const soldByTier = await loadSoldByTier(allTierIds);
    return reply.code(200).send({
      events: rows.map((e) => toPublicEventDto(e, byEvent.get(e.id) ?? [], soldByTier)),
    });
  });

  // Detail by slug or id (AC3); published + non-deleted only. 404 otherwise (AC2).
  app.get("/public/events/:slug", async (req: FastifyRequest, reply) => {
    const { slug } = req.params as { slug: string };
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    const [bySlug] = await db
      .select()
      .from(events)
      .where(and(eq(events.slug, slug), eq(events.published, true), isNull(events.deletedAt)));
    const event =
      bySlug ??
      (isUuid
        ? (
            await db
              .select()
              .from(events)
              .where(
                and(eq(events.id, slug), eq(events.published, true), isNull(events.deletedAt)),
              )
          )[0]
        : undefined);
    if (!event) return reply.code(404).send({ error: "Event not found" });

    const tiers = await db
      .select()
      .from(eventTicketTiers)
      .where(eq(eventTicketTiers.eventId, event.id));
    const soldByTier = await loadSoldByTier(tiers.map((t) => t.id));
    return reply.code(200).send({ event: toPublicEventDto(event, tiers, soldByTier) });
  });
}
