import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@bm/db/testing";
import { events, eventTicketTiers } from "@bm/db";
import { InMemorySessionStore } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * Public event listing + detail (P4-E05-S02). Unauthenticated read surface:
 * only published, non-deleted, upcoming events are listed; detail resolves by
 * slug or id and 404s for draft/cancelled/unknown. Per-tier remaining capacity
 * is exposed and sold-out tiers are flagged (here always available since
 * ticketing lands in 30-3).
 */
describe("public events (P4-E05-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore() });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const futureStart = new Date(Date.now() + 7 * 86400_000);
  const futureEnd = new Date(Date.now() + 7 * 86400_000 + 2 * 3600_000);
  const pastStart = new Date(Date.now() - 7 * 86400_000);
  const pastEnd = new Date(Date.now() - 7 * 86400_000 + 2 * 3600_000);

  async function seedEvent(opts: {
    name: string;
    slug: string;
    published: boolean;
    deleted?: boolean;
    startsAt?: Date;
    endsAt?: Date;
  }): Promise<string> {
    const id = randomUUID();
    await dbh.db.insert(events).values({
      id,
      name: opts.name,
      slug: opts.slug,
      description: "desc",
      unit: "talent_recital",
      startsAt: opts.startsAt ?? futureStart,
      endsAt: opts.endsAt ?? futureEnd,
      venue: "Main Hall",
      capacity: 100,
      published: opts.published,
      deletedAt: opts.deleted ? new Date() : null,
    });
    return id;
  }

  async function seedTier(eventId: string, name: string, priceCents: number, allotment: number) {
    await dbh.db
      .insert(eventTicketTiers)
      .values({ eventId, name, priceCents, allotment });
  }

  it("lists only published, non-deleted, upcoming events (AC1)", async () => {
    await seedEvent({ name: "Published", slug: "published", published: true });
    await seedEvent({ name: "Draft", slug: "draft", published: false });
    await seedEvent({ name: "Deleted", slug: "deleted", published: true, deleted: true });
    await seedEvent({
      name: "Past",
      slug: "past",
      published: true,
      startsAt: pastStart,
      endsAt: pastEnd,
    });

    const res = await app.inject({ method: "GET", url: "/public/events" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].slug).toBe("published");
  });

  it("requires no authentication", async () => {
    await seedEvent({ name: "Open", slug: "open", published: true });
    const res = await app.inject({ method: "GET", url: "/public/events" }); // no cookie
    expect(res.statusCode).toBe(200);
    expect(res.json().events).toHaveLength(1);
  });

  it("includes past published events with include_past=1", async () => {
    await seedEvent({
      name: "Past",
      slug: "past",
      published: true,
      startsAt: pastStart,
      endsAt: pastEnd,
    });
    await seedEvent({ name: "Future", slug: "future", published: true });

    const def = await app.inject({ method: "GET", url: "/public/events" });
    expect(def.json().events.map((e: { slug: string }) => e.slug)).toEqual(["future"]);

    const withPast = await app.inject({ method: "GET", url: "/public/events?include_past=1" });
    expect(withPast.json().events).toHaveLength(2);
  });

  it("exposes per-tier remaining capacity, sold-out flag, and free flag (AC2)", async () => {
    const id = await seedEvent({ name: "Recital", slug: "recital", published: true });
    await seedTier(id, "Adult", 50000, 10);
    await seedTier(id, "Free RSVP", 0, 50);

    const res = await app.inject({ method: "GET", url: "/public/events/recital" });
    expect(res.statusCode).toBe(200);
    const tiers = res.json().event.tiers;
    expect(tiers).toHaveLength(2);
    const adult = tiers.find((t: { name: string }) => t.name === "Adult");
    expect(adult.remaining).toBe(10);
    expect(adult.soldOut).toBe(false);
    expect(adult.isFree).toBe(false);
    const free = tiers.find((t: { name: string }) => t.name === "Free RSVP");
    expect(free.isFree).toBe(true);
  });

  it("resolves detail by slug and by id (AC3)", async () => {
    const id = await seedEvent({ name: "Recital", slug: "spring-recital", published: true });
    const bySlug = await app.inject({ method: "GET", url: "/public/events/spring-recital" });
    expect(bySlug.statusCode).toBe(200);
    expect(bySlug.json().event.id).toBe(id);

    const byId = await app.inject({ method: "GET", url: `/public/events/${id}` });
    expect(byId.statusCode).toBe(200);
    expect(byId.json().event.slug).toBe("spring-recital");
  });

  it("404s for draft, deleted, and unknown events on detail (AC2)", async () => {
    await seedEvent({ name: "Draft", slug: "draft-event", published: false });
    await seedEvent({ name: "Gone", slug: "gone-event", published: true, deleted: true });

    expect((await app.inject({ method: "GET", url: "/public/events/draft-event" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/public/events/gone-event" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/public/events/nope" })).statusCode).toBe(404);
  });
});
