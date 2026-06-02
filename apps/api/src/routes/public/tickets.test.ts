import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  events,
  eventTicketTiers,
  tickets,
  smsOutbox,
  auditOutbox,
} from "@bm/db";
import { InMemorySessionStore } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * Guest ticket checkout (P4-E05-S03) + free RSVP (P4-E05-S04). Unauthenticated
 * storefront flows: a grandparent buys/reserves seats with name + phone (no
 * account). Paid orders go through a provider then confirm (issues tickets);
 * free tiers issue immediately.
 */
describe("public ticket checkout + RSVP (P4-E05-S03/S04)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({
      db: dbh.db,
      sessions: new InMemorySessionStore(),
      // Wire the payment rails so the checkout route is enabled; transports are
      // never called for the order/confirm seam (we don't drive a real STK here).
      mpesa: {
        config: {
          baseUrl: "https://daraja.test",
          consumerKey: "k",
          consumerSecret: "s",
          shortcode: "1",
          passkey: "p",
          callbackUrl: "https://cb.test",
        },
        transport: async () =>
          new Response(
            JSON.stringify({
              MerchantRequestID: "m1",
              CheckoutRequestID: "c1",
              ResponseCode: "0",
            }),
            { status: 200 },
          ),
      },
      paystack: {
        config: { baseUrl: "https://paystack.test", secretKey: "sk", callbackUrl: "https://cb.test" },
        transport: async () =>
          new Response(
            JSON.stringify({
              status: true,
              data: { authorization_url: "https://pay.test/x", access_code: "ac", reference: "r1" },
            }),
            { status: 200 },
          ),
      },
    });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  async function seedEventWithTier(
    priceCents: number,
    allotment = 100,
    published = true,
  ): Promise<{ eventId: string; tierId: string }> {
    const eventId = randomUUID();
    await dbh.db.insert(events).values({
      id: eventId,
      name: "Spring Recital",
      slug: `recital-${eventId.slice(0, 8)}`,
      description: "desc",
      unit: "talent_recital",
      startsAt: new Date(Date.now() + 7 * 86400_000),
      endsAt: new Date(Date.now() + 7 * 86400_000 + 2 * 3600_000),
      venue: "Main Hall",
      capacity: 100,
      published,
    });
    const [tier] = await dbh.db
      .insert(eventTicketTiers)
      .values({ eventId, name: "Adult", priceCents, allotment })
      .returning();
    return { eventId, tierId: tier!.id };
  }

  it("creates a pending paid order (AC1) and audits it", async () => {
    const { eventId, tierId } = await seedEventWithTier(50000);
    const res = await app.inject({
      method: "POST",
      url: `/public/events/${eventId}/checkout`,
      payload: {
        tierId,
        quantity: 2,
        buyerName: "Grace Wanjiru",
        buyerPhone: "0712000111",
        buyerEmail: "grace@example.com",
        provider: "mpesa",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.order.status).toBe("pending");
    expect(body.order.amountCents).toBe(100000);
    expect(body.order.quantity).toBe(2);
    expect(body.order.provider).toBe("mpesa");

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "ticket.order.created"));
    expect(audits).toHaveLength(1);

    // No tickets yet (payment not confirmed).
    const issued = await dbh.db.select().from(tickets).where(eq(tickets.orderId, body.order.id));
    expect(issued).toHaveLength(0);
  });

  it("rejects checkout on a free tier (RSVP path owns that)", async () => {
    const { eventId, tierId } = await seedEventWithTier(0);
    const res = await app.inject({
      method: "POST",
      url: `/public/events/${eventId}/checkout`,
      payload: { tierId, quantity: 1, buyerName: "A", buyerPhone: "0712000111", provider: "mpesa" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("confirms a paid order: issues coded tickets + e-ticket SMS (AC2)", async () => {
    const { eventId, tierId } = await seedEventWithTier(50000);
    const created = await app.inject({
      method: "POST",
      url: `/public/events/${eventId}/checkout`,
      payload: {
        tierId,
        quantity: 3,
        buyerName: "Grace",
        buyerPhone: "0712000111",
        buyerEmail: "grace@example.com",
        provider: "paystack",
      },
    });
    const orderId = created.json().order.id as string;

    const confirm = await app.inject({
      method: "POST",
      url: `/public/ticket-orders/${orderId}/confirm`,
      payload: { paymentReference: "ps-ref-1" },
    });
    expect(confirm.statusCode).toBe(200);
    const body = confirm.json();
    expect(body.order.status).toBe("paid");
    expect(body.tickets).toHaveLength(3);
    const codes = new Set(body.tickets.map((t: { code: string }) => t.code));
    expect(codes.size).toBe(3); // unique codes
    for (const t of body.tickets) expect(t.code).toMatch(/^TK-/);

    // E-ticket SMS recorded to the outbox.
    const sms = await dbh.db
      .select()
      .from(smsOutbox)
      .where(eq(smsOutbox.template, "event.eticket"));
    expect(sms.length).toBeGreaterThanOrEqual(1);

    const paidAudit = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "ticket.order.paid"));
    expect(paidAudit).toHaveLength(1);
  });

  it("confirm is idempotent — a second confirm does not double-issue", async () => {
    const { eventId, tierId } = await seedEventWithTier(50000);
    const orderId = (
      await app.inject({
        method: "POST",
        url: `/public/events/${eventId}/checkout`,
        payload: { tierId, quantity: 2, buyerName: "G", buyerPhone: "0712000111", provider: "mpesa" },
      })
    ).json().order.id as string;

    await app.inject({ method: "POST", url: `/public/ticket-orders/${orderId}/confirm`, payload: {} });
    const second = await app.inject({
      method: "POST",
      url: `/public/ticket-orders/${orderId}/confirm`,
      payload: {},
    });
    expect(second.statusCode).toBe(200);
    const all = await dbh.db.select().from(tickets).where(eq(tickets.orderId, orderId));
    expect(all).toHaveLength(2);
  });

  it("free RSVP issues tickets immediately + RSVP SMS (AC1, AC3)", async () => {
    const { eventId, tierId } = await seedEventWithTier(0);
    const res = await app.inject({
      method: "POST",
      url: `/public/events/${eventId}/rsvp`,
      payload: { tierId, quantity: 2, buyerName: "Joy", buyerPhone: "0712000222" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.order.status).toBe("free");
    expect(body.tickets).toHaveLength(2);

    const sms = await dbh.db
      .select()
      .from(smsOutbox)
      .where(eq(smsOutbox.template, "event.rsvp"));
    expect(sms.length).toBeGreaterThanOrEqual(1);

    const rsvpAudit = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "ticket.rsvp.created"));
    expect(rsvpAudit).toHaveLength(1);
  });

  it("RSVP rejects a paid tier", async () => {
    const { eventId, tierId } = await seedEventWithTier(50000);
    const res = await app.inject({
      method: "POST",
      url: `/public/events/${eventId}/rsvp`,
      payload: { tierId, quantity: 1, buyerName: "Joy", buyerPhone: "0712000222" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an order that would exceed the tier allotment (sold-out guard)", async () => {
    const { eventId, tierId } = await seedEventWithTier(0, 2);
    const ok = await app.inject({
      method: "POST",
      url: `/public/events/${eventId}/rsvp`,
      payload: { tierId, quantity: 2, buyerName: "Joy", buyerPhone: "0712000222" },
    });
    expect(ok.statusCode).toBe(201);
    const overflow = await app.inject({
      method: "POST",
      url: `/public/events/${eventId}/rsvp`,
      payload: { tierId, quantity: 1, buyerName: "Late", buyerPhone: "0712000333" },
    });
    expect(overflow.statusCode).toBe(409);
  });

  it("public listing reflects sold count after issuance", async () => {
    const { eventId, tierId } = await seedEventWithTier(0, 10);
    await app.inject({
      method: "POST",
      url: `/public/events/${eventId}/rsvp`,
      payload: { tierId, quantity: 4, buyerName: "Joy", buyerPhone: "0712000222" },
    });
    const detail = await app.inject({ method: "GET", url: `/public/events/${eventId}` });
    const tier = detail.json().event.tiers.find((t: { id: string }) => t.id === tierId);
    expect(tier.sold).toBe(4);
    expect(tier.remaining).toBe(6);
  });

  it("404s checkout for an unpublished or unknown event", async () => {
    const { eventId, tierId } = await seedEventWithTier(50000, 100, false);
    const res = await app.inject({
      method: "POST",
      url: `/public/events/${eventId}/checkout`,
      payload: { tierId, quantity: 1, buyerName: "A", buyerPhone: "0712000111", provider: "mpesa" },
    });
    expect(res.statusCode).toBe(404);
  });
});
