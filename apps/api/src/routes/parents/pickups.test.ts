import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { childPickupAuthorisations, children, auditOutbox, parents, users } from "@bm/db";
import { createTestDb } from "@bm/db/testing";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import { buildApp } from "../../app.js";

/** Build an authenticated parent (user + profile) and return its session creds. */
async function makeParent(
  app: ReturnType<typeof buildApp>,
  db: Awaited<ReturnType<typeof createTestDb>>["db"],
  phone: string,
  rawPhone: string,
) {
  const [u] = await db
    .insert(users)
    .values({ phone, pinHash: await hashPin("1357") })
    .returning();
  const [p] = await db
    .insert(parents)
    .values({ userId: u!.id, firstName: "Amina", lastName: "Otieno" })
    .returning();
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { phone: rawPhone, pin: "1357" },
  });
  const cookies = login.headers["set-cookie"] as string[];
  const sessionCookie = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
  const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
  const csrfToken = login.json().csrfToken as string;
  return { userId: u!.id, parentId: p!.id, sessionCookie, csrfCookie, csrfToken };
}

describe("authorised pickup list per child (P2-E03-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let parent: Awaited<ReturnType<typeof makeParent>>;
  let childId: string;

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore() });
    parent = await makeParent(app, dbh.db, "+254712345678", "0712345678");
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: parent.parentId, firstName: "Zola", dateOfBirth: "2024-01-15" })
      .returning();
    childId = c!.id;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const authed = (p = parent) => ({
    cookie: `${p.sessionCookie}; ${p.csrfCookie}`,
    "x-csrf-token": p.csrfToken,
  });

  const create = (body: Record<string, unknown>, cid = childId, p = parent) =>
    app.inject({
      method: "POST",
      url: `/parents/me/children/${cid}/pickups`,
      headers: authed(p),
      payload: body,
    });

  const validPickup = {
    name: "Mary Otieno",
    phone: "0722000111",
    relationship: "Aunt",
    photoUrl: "https://cdn.example.com/mary.jpg",
  };

  it("rejects an unauthenticated request (ownership)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/parents/me/children/${childId}/pickups`,
      payload: validPickup,
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a mutating request without a CSRF token", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/parents/me/children/${childId}/pickups`,
      headers: { cookie: parent.sessionCookie },
      payload: validPickup,
    });
    expect(res.statusCode).toBe(403);
  });

  it("creates a pickup with all AC1 fields and audits pickup.created (AC1, AC2, AC3)", async () => {
    const res = await create(validPickup);
    expect(res.statusCode).toBe(201);
    const pickup = res.json().pickup;
    expect(pickup).toMatchObject({
      childId,
      name: "Mary Otieno",
      phone: "0722000111",
      relationship: "Aunt",
      photoUrl: "https://cdn.example.com/mary.jpg",
    });

    const rows = await dbh.db.select().from(childPickupAuthorisations);
    expect(rows).toHaveLength(1);

    const events = await dbh.db.select().from(auditOutbox);
    const created = events.find((e) => e.action === "pickup.created");
    expect(created).toBeDefined();
    expect(created!.actorUserId).toBe(parent.userId);
    expect(created!.targetTable).toBe("child_pickup_authorisations");
    expect(created!.targetId).toBe(pickup.id);
  });

  it("creates a pickup without a photo URL (AC1: photo optional)", async () => {
    const res = await create({ name: "Joe", phone: "0700000000", relationship: "Uncle" });
    expect(res.statusCode).toBe(201);
    expect(res.json().pickup.photoUrl).toBeNull();
  });

  it("validates required name / phone / relationship (AC1)", async () => {
    expect((await create({ phone: "0700000000", relationship: "Aunt" })).statusCode).toBe(400);
    expect((await create({ name: "A", relationship: "Aunt" })).statusCode).toBe(400);
    expect((await create({ name: "A", phone: "0700000000" })).statusCode).toBe(400);
  });

  it("lists a child's pickups, newest first (AC1, AC2)", async () => {
    const first = (await create({ name: "First", phone: "0700000001", relationship: "Aunt" })).json().pickup;
    const second = (await create({ name: "Second", phone: "0700000002", relationship: "Uncle" })).json().pickup;
    // Pin distinct created_at so "newest-first" is deterministic: the test DB clock
    // is millisecond-coarse, so two back-to-back inserts can otherwise share a
    // created_at and the order would depend on physical row order.
    await dbh.db
      .update(childPickupAuthorisations)
      .set({ createdAt: new Date("2026-01-01T00:00:00.000Z") })
      .where(eq(childPickupAuthorisations.id, first.id));
    await dbh.db
      .update(childPickupAuthorisations)
      .set({ createdAt: new Date("2026-01-02T00:00:00.000Z") })
      .where(eq(childPickupAuthorisations.id, second.id));
    const res = await app.inject({
      method: "GET",
      url: `/parents/me/children/${childId}/pickups`,
      headers: { cookie: parent.sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json().pickups;
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("Second");
  });

  it("edits a pickup and audits pickup.updated (AC2, AC3)", async () => {
    const created = (await create(validPickup)).json().pickup;
    const res = await app.inject({
      method: "PATCH",
      url: `/parents/me/children/${childId}/pickups/${created.id}`,
      headers: authed(),
      payload: { name: "Mary A. Otieno", phone: "0722999888", relationship: "Guardian" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pickup).toMatchObject({
      name: "Mary A. Otieno",
      phone: "0722999888",
      relationship: "Guardian",
    });
    const events = await dbh.db.select().from(auditOutbox);
    const updated = events.find((e) => e.action === "pickup.updated");
    expect(updated).toBeDefined();
    expect(updated!.actorUserId).toBe(parent.userId);
    expect(updated!.targetTable).toBe("child_pickup_authorisations");
    expect(updated!.targetId).toBe(created.id);
    expect((updated!.payload as { child_id?: string }).child_id).toBe(childId);
  });

  it("deletes a pickup and audits pickup.deleted (AC2, AC3)", async () => {
    const created = (await create(validPickup)).json().pickup;
    const res = await app.inject({
      method: "DELETE",
      url: `/parents/me/children/${childId}/pickups/${created.id}`,
      headers: authed(),
    });
    expect(res.statusCode).toBe(200);
    const rows = await dbh.db.select().from(childPickupAuthorisations);
    expect(rows).toHaveLength(0);
    const events = await dbh.db.select().from(auditOutbox);
    const deleted = events.find((e) => e.action === "pickup.deleted");
    expect(deleted).toBeDefined();
    expect(deleted!.actorUserId).toBe(parent.userId);
    expect(deleted!.targetId).toBe(created.id);
  });

  it("does not allow CRUD on another parent's child (ownership)", async () => {
    const other = await makeParent(app, dbh.db, "+254799999999", "0799999999");
    // other parent tries to add a pickup to our child → 404 (not found for them)
    const res = await create(validPickup, childId, other);
    expect(res.statusCode).toBe(404);
    expect(await dbh.db.select().from(childPickupAuthorisations)).toHaveLength(0);
  });

  it("rejects an empty / non-object body with 400 (validation)", async () => {
    const empty = await app.inject({
      method: "POST",
      url: `/parents/me/children/${childId}/pickups`,
      headers: authed(),
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
  });

  it("404s all verbs once the child is archived (ownership)", async () => {
    const created = (await create(validPickup)).json().pickup;
    await dbh.db
      .update(children)
      .set({ archivedAt: new Date() })
      .where(eq(children.id, childId));

    const list = await app.inject({
      method: "GET",
      url: `/parents/me/children/${childId}/pickups`,
      headers: { cookie: parent.sessionCookie },
    });
    expect(list.statusCode).toBe(404);
    expect((await create(validPickup)).statusCode).toBe(404);
    const patch = await app.inject({
      method: "PATCH",
      url: `/parents/me/children/${childId}/pickups/${created.id}`,
      headers: authed(),
      payload: validPickup,
    });
    expect(patch.statusCode).toBe(404);
    const del = await app.inject({
      method: "DELETE",
      url: `/parents/me/children/${childId}/pickups/${created.id}`,
      headers: authed(),
    });
    expect(del.statusCode).toBe(404);
  });

  it("404s editing/deleting a pickup that does not belong to the child", async () => {
    const created = (await create(validPickup)).json().pickup;
    // a second child of the same parent
    const [c2] = await dbh.db
      .insert(children)
      .values({ parentId: parent.parentId, firstName: "Bobo", dateOfBirth: "2023-06-01" })
      .returning();
    const res = await app.inject({
      method: "PATCH",
      url: `/parents/me/children/${c2!.id}/pickups/${created.id}`,
      headers: authed(),
      payload: { name: "X", phone: "0700000000", relationship: "Aunt" },
    });
    expect(res.statusCode).toBe(404);
  });
});
