import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { buildApp } from "../../app.js";
import { InMemorySessionStore } from "@bm/auth";
import { auditOutbox, getSetting } from "@bm/db";
import { eq } from "drizzle-orm";
import { seedStaffUser, loginStaff } from "../../testing/staff-auth.js";
import type { FastifyInstance } from "fastify";

/**
 * P5-E03-S02 — admin live/stub SMS switch route. Real PGlite; a seeded staff
 * session with `manage config`. Asserts the guard, the default (OFF), flipping
 * the flag, validation, and the before/after audit row (AC1, AC3).
 */
describe("admin sms-live switch API", () => {
  let testDb: TestDb;
  let app: FastifyInstance;
  let sessions: InMemorySessionStore;

  beforeEach(async () => {
    sessions = new InMemorySessionStore();
    testDb = await createTestDb();
    app = buildApp({ db: testDb.db, sessions });
  });

  async function authed(role = "admin") {
    await seedStaffUser(testDb.db, { role });
    return loginStaff(app);
  }

  it("rejects an unauthenticated caller", async () => {
    const res = await app.inject({ method: "GET", path: "/admin/sms-live" });
    expect(res.statusCode).toBe(401);
  });

  it("forbids a role without manage config (cashier)", async () => {
    const { cookie, csrf } = await authed("cashier");
    const res = await app.inject({
      method: "GET",
      path: "/admin/sms-live",
      headers: { cookie, "x-csrf-token": csrf },
    });
    expect(res.statusCode).toBe(403);
  });

  it("reports the flag OFF by default (AC1)", async () => {
    const { cookie, csrf } = await authed();
    const res = await app.inject({
      method: "GET",
      path: "/admin/sms-live",
      headers: { cookie, "x-csrf-token": csrf },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().enabled).toBe(false);
  });

  it("turns the flag ON and audits the change with before/after (AC1, AC3)", async () => {
    const { cookie, csrf } = await authed();
    const res = await app.inject({
      method: "PUT",
      path: "/admin/sms-live",
      headers: { cookie, "x-csrf-token": csrf },
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().enabled).toBe(true);
    expect(await getSetting(testDb.db, "sms.live_enabled")).toBe(true);

    const audits = await testDb.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "sms.live.toggled"));
    expect(audits).toHaveLength(1);
    const payload = audits[0]!.payload as {
      before: { enabled: boolean };
      after: { enabled: boolean };
    };
    expect(payload.before.enabled).toBe(false);
    expect(payload.after.enabled).toBe(true);
  });

  it("rejects a non-boolean payload (AC1)", async () => {
    const { cookie, csrf } = await authed();
    const res = await app.inject({
      method: "PUT",
      path: "/admin/sms-live",
      headers: { cookie, "x-csrf-token": csrf },
      payload: { enabled: "yes" },
    });
    expect(res.statusCode).toBe(400);
  });
});
