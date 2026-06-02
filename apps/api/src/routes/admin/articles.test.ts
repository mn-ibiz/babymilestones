import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P6-E06-S04 (Story 36.4) — admin Blog / Articles CRUD API. Integration via
 * app.inject with real staff sessions (+ CSRF). Covers: CRUD round-trip (AC1/AC2);
 * publish/unpublish lifecycle; slug uniqueness; RBAC (admin allowed; reception 403;
 * unauth 401); audit on mutations (article.created/.updated/.published).
 */
describe("Admin Articles API (P6-E06-S04 / Story 36.4)", () => {
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

  const validArticle = {
    slug: "weaning-101",
    title: "Weaning 101",
    bodyMd: "# Hello\n\nSome **bold** advice.",
    coverImageUrl: "https://cdn/x.jpg",
    tags: ["nutrition", "0-1y"],
    author: "Dr. Mary",
  };

  describe("RBAC", () => {
    it("401s an unauthenticated request", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/articles" });
      expect(res.statusCode).toBe(401);
    });

    it("allows an admin to create an article (AC2)", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      const res = await req("POST", "/admin/articles", creds, validArticle);
      expect(res.statusCode).toBe(201);
      expect(res.json().article.slug).toBe("weaning-101");
      expect(res.json().article.status).toBe("draft");
    });

    it("403s a reception user (lacks manage config)", async () => {
      const creds = await loginStaff("+254712000003", "7423");
      const res = await req("POST", "/admin/articles", creds, validArticle);
      expect(res.statusCode).toBe(403);
    });
  });

  describe("CRUD round-trip (AC1/AC2)", () => {
    it("creates, lists, reads and updates an article", async () => {
      const creds = await loginStaff("+254712000001", "7421");

      const created = await req("POST", "/admin/articles", creds, validArticle);
      expect(created.statusCode).toBe(201);
      const id = created.json().article.id as string;

      const listed = await req("GET", "/admin/articles", creds);
      expect(listed.statusCode).toBe(200);
      expect(listed.json().articles.map((a: { slug: string }) => a.slug)).toContain("weaning-101");

      const read = await req("GET", `/admin/articles/${id}`, creds);
      expect(read.statusCode).toBe(200);
      expect(read.json().article.bodyMd).toBe(validArticle.bodyMd);

      const updated = await req("PATCH", `/admin/articles/${id}`, creds, {
        ...validArticle,
        title: "Weaning, Revised",
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().article.title).toBe("Weaning, Revised");
    });

    it("rejects an invalid slug with 400", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      const res = await req("POST", "/admin/articles", creds, { ...validArticle, slug: "Not A Slug" });
      expect(res.statusCode).toBe(400);
    });

    it("rejects a duplicate slug with 409", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      await req("POST", "/admin/articles", creds, validArticle);
      const dup = await req("POST", "/admin/articles", creds, { ...validArticle, title: "Other" });
      expect(dup.statusCode).toBe(409);
    });

    it("404s reading an unknown article", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      const res = await req("GET", "/admin/articles/00000000-0000-0000-0000-000000000000", creds);
      expect(res.statusCode).toBe(404);
    });
  });

  describe("publish / unpublish lifecycle", () => {
    it("publish flips status to published and stamps published_at", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      const created = await req("POST", "/admin/articles", creds, validArticle);
      const id = created.json().article.id as string;

      const published = await req("POST", `/admin/articles/${id}/publish`, creds);
      expect(published.statusCode).toBe(200);
      expect(published.json().article.status).toBe("published");
      expect(published.json().article.publishedAt).not.toBeNull();

      const unpublished = await req("POST", `/admin/articles/${id}/unpublish`, creds);
      expect(unpublished.statusCode).toBe(200);
      expect(unpublished.json().article.status).toBe("draft");
    });

    it("404s publishing an unknown article", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      const res = await req("POST", "/admin/articles/00000000-0000-0000-0000-000000000000/publish", creds);
      expect(res.statusCode).toBe(404);
    });
  });

  describe("audit", () => {
    it("audits create + update + publish keyed to the session user", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      const created = await req("POST", "/admin/articles", creds, validArticle);
      const id = created.json().article.id as string;
      await req("PATCH", `/admin/articles/${id}`, creds, { ...validArticle, title: "Edited" });
      await req("POST", `/admin/articles/${id}/publish`, creds);

      const events = await dbh.db.select().from(auditOutbox);
      const actions = events.map((e) => e.action);
      expect(actions).toContain("article.created");
      expect(actions).toContain("article.updated");
      expect(actions).toContain("article.published");
    });
  });
});
