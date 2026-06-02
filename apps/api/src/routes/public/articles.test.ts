import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { users } from "@bm/db";
import { createArticle, publishArticle } from "@bm/catalog";
import { InMemorySessionStore } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P6-E06-S04 (Story 36.4) — public Blog endpoints. Unauthenticated, cached surface
 * returning the PUBLISHED article list + per-slug detail for the platform blog
 * pages (AC3). NEVER exposes a draft: an unpublished article 404s on detail and is
 * absent from the list.
 */
describe("public articles (P6-E06-S04 / Story 36.4)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore() });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  let seq = 0;
  async function seedAdmin(): Promise<string> {
    seq += 1;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+254711${String(100000 + seq).slice(-6)}`, pinHash: "x", role: "admin" })
      .returning();
    return u!.id;
  }

  const base = {
    title: "Weaning 101",
    bodyMd: "# Hello\n\nSome advice.",
    coverImageUrl: "https://cdn/x.jpg",
    author: "Dr. Mary",
  };

  describe("list", () => {
    it("returns only published articles, newest-first, with a cache header (AC3)", async () => {
      const admin = await seedAdmin();
      const older = await createArticle(dbh.db, { ...base, slug: "older", tags: ["nutrition"], createdBy: admin });
      const newer = await createArticle(dbh.db, { ...base, slug: "newer", tags: ["nutrition"], createdBy: admin });
      await createArticle(dbh.db, { ...base, slug: "hidden-draft", createdBy: admin }); // never published

      await publishArticle(dbh.db, older.id);
      await new Promise((r) => setTimeout(r, 5));
      await publishArticle(dbh.db, newer.id);

      const res = await app.inject({ method: "GET", url: "/public/articles" });
      expect(res.statusCode).toBe(200);
      const slugs = res.json().articles.map((a: { slug: string }) => a.slug);
      expect(slugs).toEqual(["newer", "older"]);
      expect(slugs).not.toContain("hidden-draft");
      expect(res.headers["cache-control"]).toContain("max-age");
      // The list is a summary — no body leaks into the index.
      expect(res.json().articles[0].bodyMd).toBeUndefined();
    });

    it("filters by tag", async () => {
      const admin = await seedAdmin();
      const sleep = await createArticle(dbh.db, { ...base, slug: "sleep", tags: ["sleep"], createdBy: admin });
      const food = await createArticle(dbh.db, { ...base, slug: "food", tags: ["nutrition"], createdBy: admin });
      await publishArticle(dbh.db, sleep.id);
      await publishArticle(dbh.db, food.id);

      const res = await app.inject({ method: "GET", url: "/public/articles?tag=sleep" });
      expect(res.statusCode).toBe(200);
      expect(res.json().articles.map((a: { slug: string }) => a.slug)).toEqual(["sleep"]);
    });
  });

  describe("detail", () => {
    it("returns a published article by slug, with a cache header (AC3)", async () => {
      const admin = await seedAdmin();
      const a = await createArticle(dbh.db, { ...base, slug: "weaning-101", tags: ["nutrition"], createdBy: admin });
      await publishArticle(dbh.db, a.id);

      const res = await app.inject({ method: "GET", url: "/public/articles/weaning-101" });
      expect(res.statusCode).toBe(200);
      expect(res.json().article.title).toBe("Weaning 101");
      expect(res.json().article.bodyMd).toBe(base.bodyMd);
      expect(res.headers["cache-control"]).toContain("max-age");
    });

    it("404s a draft slug (drafts must never leak)", async () => {
      const admin = await seedAdmin();
      await createArticle(dbh.db, { ...base, slug: "weaning-101", createdBy: admin });
      const res = await app.inject({ method: "GET", url: "/public/articles/weaning-101" });
      expect(res.statusCode).toBe(404);
    });

    it("404s an unknown slug", async () => {
      const res = await app.inject({ method: "GET", url: "/public/articles/does-not-exist" });
      expect(res.statusCode).toBe(404);
    });
  });
});
