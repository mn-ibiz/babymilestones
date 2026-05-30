import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../../app.js";
import {
  InMemorySessionStore,
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
} from "@bm/auth";
import { createTestDatabase, type TestDatabase } from "@bm/db/testing";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let testDb: TestDatabase;
let app: FastifyInstance;
let sessions: InMemorySessionStore;
let csrf: string;

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const PARENT_ID = "22222222-2222-2222-2222-222222222222";

async function seedSession(role: string, userId: string, token: string): Promise<void> {
  await testDb.db.execute(
    sql`INSERT INTO users (id, phone, role, status, full_name, password_hash)
        VALUES (${userId}, ${"+2547" + userId.slice(0, 8)}, ${role}, 'active', 'User', 'x')
        ON CONFLICT (id) DO NOTHING`,
  );
  sessions.set(token, {
    userId,
    sessionId: "sess-" + token,
    csrfToken: csrf,
    role,
    createdAt: Date.now(),
  });
}

function authed(token: string): Record<string, string> {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${token}; ${CSRF_COOKIE_NAME}=${csrf}`,
    [CSRF_HEADER_NAME]: csrf,
  };
}

beforeAll(async () => {
  testDb = await createTestDatabase();
  sessions = new InMemorySessionStore();
  app = buildApp({ db: testDb.db, sessions });
});

afterAll(async () => {
  await testDb.cleanup();
  await app.close();
});

beforeEach(async () => {
  csrf = generateCsrfToken();
  await testDb.db.execute(sql`DELETE FROM event_ticket_tiers`);
  await testDb.db.execute(sql`DELETE FROM events`);
  await testDb.db.execute(sql`DELETE FROM audit_outbox`);
});

const validEvent = {
  name: "Spring Recital 2026",
  description: "Talent showcase",
  unit: "talent_recital",
  startsAt: "2026-07-01T15:00:00.000Z",
  endsAt: "2026-07-01T18:00:00.000Z",
  venue: "Main Hall",
  capacity: 120,
  tiers: [
    { name: "Adult", priceCents: 50000, allotment: 100 },
    { name: "Child", priceCents: 0, allotment: 20 },
  ],
};

describe("admin events CRUD (P4-E05-S01)", () => {
  it("rejects unauthenticated", async () => {
    const res = await app.inject({ method: "POST", url: "/admin/events", payload: validEvent });
    expect(res.statusCode).toBe(401);
  });

  it("forbids a parent (no manage permission)", async () => {
    await seedSession("parent", PARENT_ID, "tok-parent");
    const res = await app.inject({
      method: "POST",
      url: "/admin/events",
      headers: authed("tok-parent"),
      payload: validEvent,
    });
    expect(res.statusCode).toBe(403);
  });

  it("creates an event with tiers, a slug, and an audit row (AC1, AC2, AC3)", async () => {
    await seedSession("admin", ADMIN_ID, "tok-admin");
    const res = await app.inject({
      method: "POST",
      url: "/admin/events",
      headers: authed("tok-admin"),
      payload: validEvent,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.event.id).toBeTruthy();
    expect(body.event.slug).toBe("spring-recital-2026");
    expect(body.event.unit).toBe("talent_recital");
    expect(body.event.tiers).toHaveLength(2);
    expect(body.event.tiers.map((t: { name: string }) => t.name).sort()).toEqual([
      "Adult",
      "Child",
    ]);

    const audits = (await testDb.db.execute(
      sql`SELECT action FROM audit_outbox WHERE target_id = ${body.event.id}`,
    )) as unknown as Array<{ action: string }>;
    expect(audits.map((a) => a.action)).toContain("event.created");
  });

  it("rejects an invalid unit and a bad time window", async () => {
    await seedSession("admin", ADMIN_ID, "tok-admin");
    const badUnit = await app.inject({
      method: "POST",
      url: "/admin/events",
      headers: authed("tok-admin"),
      payload: { ...validEvent, unit: "party" },
    });
    expect(badUnit.statusCode).toBe(400);

    const badWindow = await app.inject({
      method: "POST",
      url: "/admin/events",
      headers: authed("tok-admin"),
      payload: { ...validEvent, endsAt: "2026-06-01T00:00:00.000Z" },
    });
    expect(badWindow.statusCode).toBe(400);
  });

  it("generates unique slugs for duplicate names", async () => {
    await seedSession("admin", ADMIN_ID, "tok-admin");
    const first = await app.inject({
      method: "POST",
      url: "/admin/events",
      headers: authed("tok-admin"),
      payload: validEvent,
    });
    const second = await app.inject({
      method: "POST",
      url: "/admin/events",
      headers: authed("tok-admin"),
      payload: validEvent,
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().event.slug).toBe("spring-recital-2026");
    expect(second.json().event.slug).toBe("spring-recital-2026-2");
  });

  it("lists, fetches, updates, publishes and soft-deletes events (AC3)", async () => {
    await seedSession("admin", ADMIN_ID, "tok-admin");
    const created = (
      await app.inject({
        method: "POST",
        url: "/admin/events",
        headers: authed("tok-admin"),
        payload: validEvent,
      })
    ).json().event;

    const list = await app.inject({ method: "GET", url: "/admin/events", headers: authed("tok-admin") });
    expect(list.statusCode).toBe(200);
    expect(list.json().events.length).toBe(1);

    const got = await app.inject({
      method: "GET",
      url: `/admin/events/${created.id}`,
      headers: authed("tok-admin"),
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().event.tiers).toHaveLength(2);

    const patched = await app.inject({
      method: "PATCH",
      url: `/admin/events/${created.id}`,
      headers: authed("tok-admin"),
      payload: { name: "Renamed", published: true },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().event.name).toBe("Renamed");
    expect(patched.json().event.published).toBe(true);

    const auditsAfterPublish = (await testDb.db.execute(
      sql`SELECT action FROM audit_outbox WHERE target_id = ${created.id}`,
    )) as unknown as Array<{ action: string }>;
    expect(auditsAfterPublish.map((a) => a.action)).toContain("event.published");

    const del = await app.inject({
      method: "DELETE",
      url: `/admin/events/${created.id}`,
      headers: authed("tok-admin"),
    });
    expect(del.statusCode).toBe(200);

    const listAfter = await app.inject({
      method: "GET",
      url: "/admin/events",
      headers: authed("tok-admin"),
    });
    expect(listAfter.json().events.length).toBe(0);

    const gotAfter = await app.inject({
      method: "GET",
      url: `/admin/events/${created.id}`,
      headers: authed("tok-admin"),
    });
    expect(gotAfter.statusCode).toBe(404);
  });
});
