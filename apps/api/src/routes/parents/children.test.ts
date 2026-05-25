import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, children, parents, users } from "@bm/db";
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

describe("children registry routes (P1-E02-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let parent: Awaited<ReturnType<typeof makeParent>>;

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore() });
    parent = await makeParent(app, dbh.db, "+254712345678", "0712345678");
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const authed = (p = parent) => ({
    cookie: `${p.sessionCookie}; ${p.csrfCookie}`,
    "x-csrf-token": p.csrfToken,
  });

  const addChild = (body: Record<string, unknown>, p = parent) =>
    app.inject({ method: "POST", url: "/parents/me/children", headers: authed(p), payload: body });

  it("rejects an unauthenticated request (AC: ownership)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/parents/me/children",
      payload: { firstName: "Z", dateOfBirth: "2024-01-15" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a mutating request without a CSRF token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/parents/me/children",
      headers: { cookie: parent.sessionCookie },
      payload: { firstName: "Z", dateOfBirth: "2024-01-15" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("adds a child, derives age, audits child.created (AC1, AC2, AC5)", async () => {
    const res = await addChild({
      firstName: "Zola",
      lastName: "Otieno",
      dateOfBirth: "2024-01-15",
      gender: "female",
      allergiesNotes: "Peanuts",
    });
    expect(res.statusCode).toBe(201);
    const child = res.json().child;
    expect(child).toMatchObject({
      firstName: "Zola",
      lastName: "Otieno",
      dateOfBirth: "2024-01-15",
      gender: "female",
      allergiesNotes: "Peanuts",
      archivedAt: null,
    });
    expect(typeof child.ageInMonths).toBe("number");

    const events = await dbh.db.select().from(auditOutbox);
    const created = events.find((e) => e.action === "child.created");
    expect(created).toBeDefined();
    expect(created!.actorUserId).toBe(parent.userId);
    expect(created!.targetTable).toBe("children");
    expect(created!.targetId).toBe(child.id);
  });

  it("validates DOB required and 500-char notes cap (AC1)", async () => {
    const noDob = await addChild({ firstName: "Zola" });
    expect(noDob.statusCode).toBe(400);
    expect(noDob.json().field).toBe("dateOfBirth");

    const longNotes = await addChild({
      firstName: "Zola",
      dateOfBirth: "2024-01-15",
      allergiesNotes: "a".repeat(501),
    });
    expect(longNotes.statusCode).toBe(400);
    expect(longNotes.json().field).toBe("allergiesNotes");
  });

  it("edits a child preserving all fields, audits child.updated (AC3, AC5)", async () => {
    const created = (await addChild({ firstName: "Zola", dateOfBirth: "2024-01-15" })).json().child;
    const res = await app.inject({
      method: "PUT",
      url: `/parents/me/children/${created.id}`,
      headers: authed(),
      payload: {
        firstName: "Zola",
        lastName: "Otieno",
        dateOfBirth: "2024-02-20",
        gender: "female",
        allergiesNotes: "Dust",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().child).toMatchObject({
      id: created.id,
      lastName: "Otieno",
      dateOfBirth: "2024-02-20",
      gender: "female",
      allergiesNotes: "Dust",
    });

    const rows = await dbh.db.select().from(children).where(eq(children.id, created.id));
    expect(rows).toHaveLength(1);
    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "child.updated")).toBe(true);
  });

  it("soft-deletes via archived_at, keeps the row, audits child.archived (AC4, AC5)", async () => {
    const created = (await addChild({ firstName: "Zola", dateOfBirth: "2024-01-15" })).json().child;
    const res = await app.inject({
      method: "DELETE",
      url: `/parents/me/children/${created.id}`,
      headers: authed(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().child.archivedAt).not.toBeNull();

    // Row remains (historical bookings stay intact).
    const rows = await dbh.db.select().from(children).where(eq(children.id, created.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.archivedAt).toBeInstanceOf(Date);

    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "child.archived")).toBe(true);
  });

  it("lists only the authenticated parent's children with derived age (AC2, ownership)", async () => {
    await addChild({ firstName: "Zola", dateOfBirth: "2024-01-15" });
    const res = await app.inject({
      method: "GET",
      url: "/parents/me/children",
      headers: { cookie: parent.sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json().children;
    expect(list).toHaveLength(1);
    expect(list[0].firstName).toBe("Zola");
    expect(typeof list[0].ageInMonths).toBe("number");
  });

  it("enforces ownership — a parent cannot view, edit or archive another's child", async () => {
    const other = await makeParent(app, dbh.db, "+254799999999", "0799999999");
    const mine = (await addChild({ firstName: "Zola", dateOfBirth: "2024-01-15" })).json().child;

    // Other parent's list must not include my child.
    const otherList = await app.inject({
      method: "GET",
      url: "/parents/me/children",
      headers: { cookie: other.sessionCookie },
    });
    expect(otherList.json().children).toHaveLength(0);

    // Edit attempt → 404 (not found within their ownership scope).
    const edit = await app.inject({
      method: "PUT",
      url: `/parents/me/children/${mine.id}`,
      headers: authed(other),
      payload: { firstName: "Hacked", dateOfBirth: "2024-01-15" },
    });
    expect(edit.statusCode).toBe(404);

    // Archive attempt → 404.
    const del = await app.inject({
      method: "DELETE",
      url: `/parents/me/children/${mine.id}`,
      headers: authed(other),
    });
    expect(del.statusCode).toBe(404);

    // My child is untouched.
    const [row] = await dbh.db.select().from(children).where(eq(children.id, mine.id));
    expect(row!.firstName).toBe("Zola");
    expect(row!.archivedAt).toBeNull();
  });

  // --- Restore archived child (P1-E11-S02 AC3) ---

  it("restores a soft-deleted child, clears archived_at, audits child.restored (AC3)", async () => {
    const created = (await addChild({ firstName: "Zola", dateOfBirth: "2024-01-15" })).json().child;
    await app.inject({ method: "DELETE", url: `/parents/me/children/${created.id}`, headers: authed() });

    const res = await app.inject({
      method: "POST",
      url: `/parents/me/children/${created.id}/restore`,
      headers: authed(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().child.archivedAt).toBeNull();

    const [row] = await dbh.db.select().from(children).where(eq(children.id, created.id));
    expect(row!.archivedAt).toBeNull();

    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "child.restored")).toBe(true);
  });

  it("rejects an unauthenticated / CSRF-less restore", async () => {
    const created = (await addChild({ firstName: "Zola", dateOfBirth: "2024-01-15" })).json().child;
    await app.inject({ method: "DELETE", url: `/parents/me/children/${created.id}`, headers: authed() });

    const noAuth = await app.inject({
      method: "POST",
      url: `/parents/me/children/${created.id}/restore`,
    });
    expect(noAuth.statusCode).toBe(401);
    const noCsrf = await app.inject({
      method: "POST",
      url: `/parents/me/children/${created.id}/restore`,
      headers: { cookie: parent.sessionCookie },
    });
    expect(noCsrf.statusCode).toBe(403);
  });

  it("enforces ownership on restore — 404 for another parent's child (AC3)", async () => {
    const other = await makeParent(app, dbh.db, "+254799999999", "0799999999");
    const mine = (await addChild({ firstName: "Zola", dateOfBirth: "2024-01-15" })).json().child;
    await app.inject({ method: "DELETE", url: `/parents/me/children/${mine.id}`, headers: authed() });

    const res = await app.inject({
      method: "POST",
      url: `/parents/me/children/${mine.id}/restore`,
      headers: authed(other),
    });
    expect(res.statusCode).toBe(404);
    const [row] = await dbh.db.select().from(children).where(eq(children.id, mine.id));
    expect(row!.archivedAt).toBeInstanceOf(Date);
  });

  // --- Photo consent (P1-E02-S04) ---

  const setPhotoConsent = (id: string, body: Record<string, unknown>, p = parent) =>
    app.inject({
      method: "PUT",
      url: `/parents/me/children/${id}/consent/photo`,
      headers: authed(p),
      payload: body,
    });

  it("photo consent defaults false on a new child (AC1)", async () => {
    const child = (await addChild({ firstName: "Zola", dateOfBirth: "2024-01-15" })).json().child;
    expect(child.photoConsent).toBe(false);
  });

  it("rejects an unauthenticated / CSRF-less / non-boolean photo-consent toggle", async () => {
    const child = (await addChild({ firstName: "Zola", dateOfBirth: "2024-01-15" })).json().child;
    const noAuth = await app.inject({
      method: "PUT",
      url: `/parents/me/children/${child.id}/consent/photo`,
      payload: { photoConsent: true },
    });
    expect(noAuth.statusCode).toBe(401);
    const noCsrf = await app.inject({
      method: "PUT",
      url: `/parents/me/children/${child.id}/consent/photo`,
      headers: { cookie: parent.sessionCookie },
      payload: { photoConsent: true },
    });
    expect(noCsrf.statusCode).toBe(403);
    const badValue = await setPhotoConsent(child.id, { photoConsent: 1 });
    expect(badValue.statusCode).toBe(400);
    expect(badValue.json().field).toBe("photoConsent");
  });

  it("toggles photo consent, audited with a timestamp (AC1, AC2)", async () => {
    const child = (await addChild({ firstName: "Zola", dateOfBirth: "2024-01-15" })).json().child;

    const on = await setPhotoConsent(child.id, { photoConsent: true });
    expect(on.statusCode).toBe(200);
    expect(on.json().child.photoConsent).toBe(true);

    const [row] = await dbh.db.select().from(children).where(eq(children.id, child.id));
    expect(row!.photoConsent).toBe(true);

    await setPhotoConsent(child.id, { photoConsent: false });
    const [after] = await dbh.db.select().from(children).where(eq(children.id, child.id));
    expect(after!.photoConsent).toBe(false);

    const events = await dbh.db.select().from(auditOutbox);
    const consentEvents = events.filter((e) => e.action === "child.consent.photo");
    expect(consentEvents).toHaveLength(2);
    expect(consentEvents[0]!.actorUserId).toBe(parent.userId);
    expect(consentEvents[0]!.targetTable).toBe("children");
    expect(consentEvents[0]!.targetId).toBe(child.id);
    expect(consentEvents[0]!.createdAt).toBeInstanceOf(Date);
    const payload = consentEvents[0]!.payload as { at?: string; photo_consent?: boolean };
    expect(typeof payload.at).toBe("string");
    expect(payload.photo_consent).toBe(true);
  });

  it("enforces ownership on photo-consent — 404 for another parent's child", async () => {
    const other = await makeParent(app, dbh.db, "+254799999999", "0799999999");
    const mine = (await addChild({ firstName: "Zola", dateOfBirth: "2024-01-15" })).json().child;
    const res = await setPhotoConsent(mine.id, { photoConsent: true }, other);
    expect(res.statusCode).toBe(404);
    const [row] = await dbh.db.select().from(children).where(eq(children.id, mine.id));
    expect(row!.photoConsent).toBe(false);
  });
});
