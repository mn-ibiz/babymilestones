import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { adminAlerts, auditOutbox, users } from "@bm/db";
import { eq } from "drizzle-orm";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P6-E04-S03 (Story 34.3) — admin in-app alerts API. Integration via app.inject
 * with real staff sessions (+ CSRF). The bell list reads UNREAD alerts; an admin
 * can DISMISS one (audited). Gated to the report-reading roles (admin /
 * super_admin / treasury / accountant) — the same posture as the feedback
 * dashboard the alerts link to.
 *
 *   GET    /admin/alerts            — the unread alerts list (AC1/AC2).
 *   POST   /admin/alerts/:id/dismiss — dismiss an alert (audited).
 */
describe("Admin alerts API (P6-E04-S03)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    const csrfToken = decodeURIComponent(csrfCookie.split("=")[1]!);
    return { session, csrfCookie, csrfToken };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const get = (url: string, creds: Creds) =>
    app.inject({ method: "GET", url, headers: { cookie: [creds.session, creds.csrfCookie].join("; ") } });
  const post = (url: string, creds: Creds) =>
    app.inject({
      method: "POST",
      url,
      headers: {
        cookie: [creds.session, creds.csrfCookie].join("; "),
        "x-csrf-token": creds.csrfToken,
      },
      payload: {},
    });

  async function seedAlert(sourceId: string, createdAt = new Date("2026-06-12T10:00:00Z")) {
    const [a] = await dbh.db
      .insert(adminAlerts)
      .values({
        type: "negative_feedback",
        severity: "warning",
        sourceType: "feedback",
        sourceId,
        title: `Low rating for ${sourceId}`,
        body: "x",
        linkPath: `/feedback?focus=${sourceId}`,
        createdAt,
      })
      .returning();
    return a!;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000004", "7424", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("lists unread alerts newest-first, each carrying its detail link (AC1/AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    await seedAlert("f1", new Date("2026-06-10T08:00:00Z"));
    await seedAlert("f2", new Date("2026-06-12T08:00:00Z"));
    const res = await get("/admin/alerts", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(2);
    expect(body.alerts.map((a: { sourceId: string }) => a.sourceId)).toEqual(["f2", "f1"]);
    // AC2: each alert links to the feedback detail.
    expect(body.alerts[0].linkPath).toContain("/feedback");
  });

  it("dismisses an alert — drops it off the unread list + writes an audit row", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const a = await seedAlert("f1");
    const res = await post(`/admin/alerts/${a.id}/dismiss`, creds);
    expect(res.statusCode).toBe(200);

    const [row] = await dbh.db.select().from(adminAlerts).where(eq(adminAlerts.id, a.id));
    expect(row!.dismissedAt).not.toBeNull();

    // The dismiss is audited.
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "alert.dismissed"));
    expect(audits).toHaveLength(1);

    // It no longer appears in the list.
    const list = await get("/admin/alerts", creds);
    expect(list.json().count).toBe(0);
  });

  it("404s dismissing an unknown alert id", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await post("/admin/alerts/00000000-0000-0000-0000-000000000000/dismiss", creds);
    expect(res.statusCode).toBe(404);
  });

  it("allows a treasury (report-reading) role to list alerts", async () => {
    const creds = await loginStaff("+254712000004", "7424");
    await seedAlert("f1");
    const res = await get("/admin/alerts", creds);
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBe(1);
  });

  it("403s a non-report role (reception) on the alerts list (RBAC)", async () => {
    const creds = await loginStaff("+254712000003", "7423");
    const res = await get("/admin/alerts", creds);
    expect(res.statusCode).toBe(403);
  });

  it("403s a non-report role (reception) on dismiss (RBAC)", async () => {
    const creds = await loginStaff("+254712000003", "7423");
    const a = await seedAlert("f1");
    const res = await post(`/admin/alerts/${a.id}/dismiss`, creds);
    expect(res.statusCode).toBe(403);
  });

  it("401s an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/alerts" });
    expect(res.statusCode).toBe(401);
  });
});
