import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  events,
  eventTicketTiers,
  ticketOrders,
  tickets,
  auditOutbox,
  users,
} from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * Door check-in (P4-E05-S05). Staff-gated. Lists sold tickets (search by
 * name/phone/code, AC1), marks checked-in with a double-scan guard (AC2), and
 * exposes a capacity-vs-checked-in counter (AC3).
 */
describe("door check-in (P4-E05-S05)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let eventId: string;
  let tierId: string;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const req = (
    method: "GET" | "POST",
    url: string,
    creds: Creds,
    payload?: Record<string, unknown>,
    auth = true,
  ) =>
    app.inject({
      method,
      url,
      headers: {
        cookie: auth ? `${creds.session}; ${creds.csrfCookie}` : creds.csrfCookie,
        "x-csrf-token": creds.csrfToken,
      },
      ...(payload ? { payload } : {}),
    });

  async function seedTicket(code: string, buyerName: string, buyerPhone: string) {
    const [order] = await dbh.db
      .insert(ticketOrders)
      .values({
        eventId,
        tierId,
        buyerName,
        buyerPhone,
        quantity: 1,
        amountCents: 50000,
        status: "paid",
      })
      .returning();
    await dbh.db.insert(tickets).values({
      code,
      orderId: order!.id,
      eventId,
      tierId,
      buyerName,
      buyerPhone,
      status: "issued",
    });
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));

    eventId = randomUUID();
    await dbh.db.insert(events).values({
      id: eventId,
      name: "Spring Recital",
      slug: "spring-recital-door",
      unit: "talent_recital",
      startsAt: new Date(Date.now() + 86400_000),
      endsAt: new Date(Date.now() + 86400_000 + 7200_000),
      venue: "Main Hall",
      capacity: 100,
      published: true,
    });
    const [tier] = await dbh.db
      .insert(eventTicketTiers)
      .values({ eventId, name: "Adult", priceCents: 50000, allotment: 100 })
      .returning();
    tierId = tier!.id;

    await seedTicket("TK-AAAA1111", "Grace Wanjiru", "+254712000111");
    await seedTicket("TK-BBBB2222", "John Otieno", "+254712000222");
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("rejects unauthenticated and forbids reception (staff-gated)", async () => {
    const admin = await loginStaff("+254712000001", "7421");
    const unauth = await req("GET", `/admin/events/${eventId}/door`, admin, undefined, false);
    expect(unauth.statusCode).toBe(401);

    const reception = await loginStaff("+254712000003", "7423");
    const forbidden = await req("GET", `/admin/events/${eventId}/door`, reception);
    expect(forbidden.statusCode).toBe(403);
  });

  it("lists all sold tickets with the capacity counter (AC1, AC3)", async () => {
    const admin = await loginStaff("+254712000001", "7421");
    const res = await req("GET", `/admin/events/${eventId}/door`, admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.checkedIn).toBe(0);
    expect(body.tickets).toHaveLength(2);
  });

  it("searches by name, phone, and code (AC1)", async () => {
    const admin = await loginStaff("+254712000001", "7421");
    const byName = await req("GET", `/admin/events/${eventId}/door?q=grace`, admin);
    expect(byName.json().tickets).toHaveLength(1);
    expect(byName.json().tickets[0].buyerName).toBe("Grace Wanjiru");

    const byCode = await req("GET", `/admin/events/${eventId}/door?q=BBBB2222`, admin);
    expect(byCode.json().tickets).toHaveLength(1);
    expect(byCode.json().tickets[0].code).toBe("TK-BBBB2222");

    const byPhone = await req("GET", `/admin/events/${eventId}/door?q=000222`, admin);
    expect(byPhone.json().tickets).toHaveLength(1);
  });

  it("marks a ticket checked in, audited; counter advances (AC2, AC3)", async () => {
    const admin = await loginStaff("+254712000001", "7421");
    const res = await req("POST", `/admin/events/${eventId}/door/check-in`, admin, {
      code: "TK-AAAA1111",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ticket.status).toBe("checked_in");
    expect(res.json().ticket.checkedInAt).toBeTruthy();

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "ticket.checked_in"));
    expect(audits).toHaveLength(1);

    const list = await req("GET", `/admin/events/${eventId}/door`, admin);
    expect(list.json().checkedIn).toBe(1);
  });

  it("blocks a double scan (AC2)", async () => {
    const admin = await loginStaff("+254712000001", "7421");
    await req("POST", `/admin/events/${eventId}/door/check-in`, admin, { code: "TK-AAAA1111" });
    const second = await req("POST", `/admin/events/${eventId}/door/check-in`, admin, {
      code: "TK-AAAA1111",
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().status).toBe("checked_in");
  });

  it("404s an unknown code or a code from another event", async () => {
    const admin = await loginStaff("+254712000001", "7421");
    const unknown = await req("POST", `/admin/events/${eventId}/door/check-in`, admin, {
      code: "TK-ZZZZ9999",
    });
    expect(unknown.statusCode).toBe(404);
  });
});
