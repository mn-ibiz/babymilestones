import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * Admin event + ticket-tier CRUD (P4-E05-S01). Integration via app.inject with
 * real staff sessions (+ CSRF), mirroring plans.test.ts. Covers `manage service`
 * enforcement, create + audit, validation, slug uniqueness, and the
 * list/get/update/publish/delete lifecycle.
 */
describe("admin events CRUD (P4-E05-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const req = (
    method: "GET" | "POST" | "PATCH" | "DELETE",
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

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
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

  it("rejects unauthenticated", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/events", creds, validEvent, false);
    expect(res.statusCode).toBe(401);
  });

  it("forbids a reception user (no manage service)", async () => {
    const creds = await loginStaff("+254712000003", "7423");
    const res = await req("POST", "/admin/events", creds, validEvent);
    expect(res.statusCode).toBe(403);
  });

  it("creates an event with tiers, a slug, and an audit row (AC1, AC2, AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/events", creds, validEvent);
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

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "event.created"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.targetId).toBe(body.event.id);
  });

  it("rejects an invalid unit and a bad time window", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const badUnit = await req("POST", "/admin/events", creds, { ...validEvent, unit: "party" });
    expect(badUnit.statusCode).toBe(400);
    const badWindow = await req("POST", "/admin/events", creds, {
      ...validEvent,
      endsAt: "2026-06-01T00:00:00.000Z",
    });
    expect(badWindow.statusCode).toBe(400);
  });

  it("generates unique slugs for duplicate names", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const first = await req("POST", "/admin/events", creds, validEvent);
    const second = await req("POST", "/admin/events", creds, validEvent);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().event.slug).toBe("spring-recital-2026");
    expect(second.json().event.slug).toBe("spring-recital-2026-2");
  });

  it("lists, fetches, updates, publishes and soft-deletes events (AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const created = (await req("POST", "/admin/events", creds, validEvent)).json().event;

    const list = await req("GET", "/admin/events", creds);
    expect(list.statusCode).toBe(200);
    expect(list.json().events.length).toBe(1);

    const got = await req("GET", `/admin/events/${created.id}`, creds);
    expect(got.statusCode).toBe(200);
    expect(got.json().event.tiers).toHaveLength(2);

    const patched = await req("PATCH", `/admin/events/${created.id}`, creds, {
      name: "Renamed",
      published: true,
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().event.name).toBe("Renamed");
    expect(patched.json().event.published).toBe(true);

    const auditsAfterPublish = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "event.published"));
    expect(auditsAfterPublish.length).toBeGreaterThanOrEqual(1);

    const del = await req("DELETE", `/admin/events/${created.id}`, creds);
    expect(del.statusCode).toBe(200);

    const listAfter = await req("GET", "/admin/events", creds);
    expect(listAfter.json().events.length).toBe(0);

    const gotAfter = await req("GET", `/admin/events/${created.id}`, creds);
    expect(gotAfter.statusCode).toBe(404);
  });
});
