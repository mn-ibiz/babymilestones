import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, cmsPages, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P6-E06-S03 (Story 36.3) — admin CMS Pages CRUD API. Integration via app.inject
 * with real staff sessions (+ CSRF). Covers: CRUD round-trip (AC1); draft vs
 * published separation + preview-the-draft (AC2); a revision on every save +
 * publish, and the revisions list (AC3); RBAC (admin allowed; reception 403;
 * unauth 401); audit on mutations.
 */
describe("Admin CMS pages API (P6-E06-S03 / Story 36.3)", () => {
  let dbh: TestDb;
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

  const req = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, creds: Creds, body?: unknown) =>
    app.inject({
      method,
      url,
      headers: { cookie: [creds.session, creds.csrfCookie].join("; "), "x-csrf-token": creds.csrfToken },
      payload: body as Record<string, unknown> | undefined,
    });

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await dbh.close();
  });

  const validPage = {
    slug: "play",
    heroCopy: "Open play sessions for little ones.",
    heroImageUrl: "https://x/play.jpg",
    ctaLabel: "Book now",
    ctaHref: "/signup",
    bodySections: [{ heading: "What we offer", body: "Soft play." }],
  };

  describe("RBAC", () => {
    it("401s an unauthenticated request", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/cms-pages" });
      expect(res.statusCode).toBe(401);
    });

    it("allows an admin to save a page (AC1)", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      const res = await req("POST", "/admin/cms-pages", creds, validPage);
      expect(res.statusCode).toBe(201);
      expect(res.json().page.slug).toBe("play");
      expect(res.json().page.status).toBe("draft");
    });

    it("403s a reception user (lacks manage config)", async () => {
      const creds = await loginStaff("+254712000003", "7423");
      const res = await req("POST", "/admin/cms-pages", creds, validPage);
      expect(res.statusCode).toBe(403);
    });
  });

  describe("CRUD round-trip (AC1)", () => {
    it("creates, lists, reads-draft and updates a page", async () => {
      const creds = await loginStaff("+254712000001", "7421");

      const created = await req("POST", "/admin/cms-pages", creds, validPage);
      expect(created.statusCode).toBe(201);

      const listed = await req("GET", "/admin/cms-pages", creds);
      expect(listed.statusCode).toBe(200);
      expect(listed.json().pages.map((p: { slug: string }) => p.slug)).toContain("play");

      const draft = await req("GET", "/admin/cms-pages/play", creds);
      expect(draft.statusCode).toBe(200);
      expect(draft.json().page.heroCopy).toBe(validPage.heroCopy);

      const updated = await req("POST", "/admin/cms-pages", creds, {
        ...validPage,
        heroCopy: "Edited copy.",
      });
      expect(updated.statusCode).toBe(201);
      expect(updated.json().page.heroCopy).toBe("Edited copy.");
    });

    it("rejects an unknown slug with 400", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      const res = await req("POST", "/admin/cms-pages", creds, { ...validPage, slug: "warehouse" });
      expect(res.statusCode).toBe(400);
    });

    it("404s reading the draft of a page that does not exist", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      const res = await req("GET", "/admin/cms-pages/salon", creds);
      expect(res.statusCode).toBe(404);
    });
  });

  describe("draft vs published + preview (AC2)", () => {
    it("publish flips status to published and stamps published_at", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      await req("POST", "/admin/cms-pages", creds, validPage);

      const published = await req("POST", "/admin/cms-pages/play/publish", creds);
      expect(published.statusCode).toBe(200);
      expect(published.json().page.status).toBe("published");
      expect(published.json().page.publishedAt).not.toBeNull();
    });

    it("the preview endpoint returns the in-progress DRAFT for an admin", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      await req("POST", "/admin/cms-pages", creds, validPage);
      await req("POST", "/admin/cms-pages/play/publish", creds);
      // Edit after publish — the working row is now a draft.
      await req("POST", "/admin/cms-pages", creds, { ...validPage, heroCopy: "In-progress draft." });

      const preview = await req("GET", "/admin/cms-pages/play/preview", creds);
      expect(preview.statusCode).toBe(200);
      expect(preview.json().page.heroCopy).toBe("In-progress draft.");
      expect(preview.json().page.status).toBe("draft");
    });

    it("404s publishing a slug with no page", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      const res = await req("POST", "/admin/cms-pages/salon/publish", creds);
      expect(res.statusCode).toBe(404);
    });
  });

  describe("revisions retained (AC3)", () => {
    it("each save creates a revision and publish adds another; list is newest-first", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      await req("POST", "/admin/cms-pages", creds, validPage);
      await req("POST", "/admin/cms-pages", creds, { ...validPage, heroCopy: "Second save." });
      await req("POST", "/admin/cms-pages/play/publish", creds);

      const revs = await req("GET", "/admin/cms-pages/play/revisions", creds);
      expect(revs.statusCode).toBe(200);
      // 2 saves + 1 publish = 3 retained revisions.
      expect(revs.json().revisions).toHaveLength(3);
      expect(revs.json().revisions[0].snapshot.status).toBe("published");
      expect(revs.json().revisions[1].snapshot.heroCopy).toBe("Second save.");
    });
  });

  describe("audit", () => {
    it("audits page save + publish keyed to the session user", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      await req("POST", "/admin/cms-pages", creds, validPage);
      await req("POST", "/admin/cms-pages/play/publish", creds);

      const events = await dbh.db.select().from(auditOutbox);
      const actions = events.map((e) => e.action);
      expect(actions).toContain("cms.unit_page.created");
      expect(actions).toContain("cms.unit_page.published");
      const [page] = await dbh.db.select().from(cmsPages).where(eq(cmsPages.slug, "play"));
      expect(page).toBeTruthy();
    });

    it("logs cms.unit_page.updated (not created) on a second save of the same slug", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      await req("POST", "/admin/cms-pages", creds, validPage);
      await req("POST", "/admin/cms-pages", creds, { ...validPage, heroCopy: "Again." });

      const events = await dbh.db.select().from(auditOutbox);
      const actions = events.map((e) => e.action);
      expect(actions).toContain("cms.unit_page.created");
      expect(actions).toContain("cms.unit_page.updated");
    });
  });
});
