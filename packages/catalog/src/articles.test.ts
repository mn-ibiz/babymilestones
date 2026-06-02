import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { users } from "@bm/db";
import {
  createArticle,
  updateArticle,
  publishArticle,
  unpublishArticle,
  getArticle,
  getArticleBySlug,
  getPublishedArticle,
  listPublishedArticles,
  listArticlesForAdmin,
  ArticleValidationError,
  ArticleSlugTakenError,
} from "./articles.js";

/**
 * P6-E06-S04 (Story 36.4) — Blog / parenting stories module. DB-backed via PGlite.
 * Covers: create/update with slug-format + uniqueness validation (AC1); publish
 * makes it public + unpublish hides it (AC1/AC3); the public list (newest-first +
 * tag filter, drafts excluded) + per-slug detail (AC3); the admin list (all rows).
 */
describe("articles module (P6-E06-S04 / Story 36.4)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  let seq = 0;
  async function seedActor(): Promise<string> {
    seq += 1;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+254711${String(100000 + seq).slice(-6)}`, pinHash: "x", role: "admin" })
      .returning();
    return u!.id;
  }

  const base = {
    slug: "weaning-101",
    title: "Weaning 101",
    bodyMd: "# Hello\n\nSome **bold** advice.",
    coverImageUrl: "https://cdn/x.jpg",
    tags: ["nutrition", "0-1y"],
    author: "Dr. Mary",
  };

  describe("create (AC1)", () => {
    it("creates a draft article", async () => {
      const actor = await seedActor();
      const a = await createArticle(dbh.db, { ...base, createdBy: actor });
      expect(a.slug).toBe("weaning-101");
      expect(a.status).toBe("draft");
      expect(a.publishedAt).toBeNull();
      expect(a.tags).toEqual(["nutrition", "0-1y"]);
      expect(a.createdBy).toBe(actor);
    });

    it("rejects an invalid slug format", async () => {
      const actor = await seedActor();
      await expect(
        createArticle(dbh.db, { ...base, slug: "Not A Slug", createdBy: actor }),
      ).rejects.toBeInstanceOf(ArticleValidationError);
    });

    it("rejects an empty title / body / author", async () => {
      const actor = await seedActor();
      await expect(
        createArticle(dbh.db, { ...base, slug: "a", title: "  ", createdBy: actor }),
      ).rejects.toBeInstanceOf(ArticleValidationError);
      await expect(
        createArticle(dbh.db, { ...base, slug: "b", bodyMd: "", createdBy: actor }),
      ).rejects.toBeInstanceOf(ArticleValidationError);
      await expect(
        createArticle(dbh.db, { ...base, slug: "c", author: "", createdBy: actor }),
      ).rejects.toBeInstanceOf(ArticleValidationError);
    });

    it("rejects a duplicate slug (uniqueness)", async () => {
      const actor = await seedActor();
      await createArticle(dbh.db, { ...base, createdBy: actor });
      await expect(
        createArticle(dbh.db, { ...base, title: "Another", createdBy: actor }),
      ).rejects.toBeInstanceOf(ArticleSlugTakenError);
    });

    // Defence-in-depth scheme-safety guard for the cover image URL (security review
    // of Story 36.4) — mirrors the contracts refine + the parallel CMS hardening so
    // an unsafe scheme is rejected at the catalog layer too, never reaching the DB.
    it("rejects an unsafe coverImageUrl scheme", async () => {
      const actor = await seedActor();
      for (const bad of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "//evil.com"]) {
        await expect(
          createArticle(dbh.db, {
            ...base,
            slug: `bad-${Math.random().toString(36).slice(2, 8)}`,
            coverImageUrl: bad,
            createdBy: actor,
          }),
        ).rejects.toBeInstanceOf(ArticleValidationError);
      }
    });

    it("normalises tags (trims, drops blanks)", async () => {
      const actor = await seedActor();
      const a = await createArticle(dbh.db, {
        ...base,
        slug: "tagged",
        tags: [" sleep ", "", "  ", "nutrition"],
        createdBy: actor,
      });
      expect(a.tags).toEqual(["sleep", "nutrition"]);
    });
  });

  describe("update (AC1)", () => {
    it("updates fields by id", async () => {
      const actor = await seedActor();
      const a = await createArticle(dbh.db, { ...base, createdBy: actor });
      const updated = await updateArticle(dbh.db, a.id, {
        title: "Weaning, Revised",
        bodyMd: "New body.",
        slug: "weaning-101",
        coverImageUrl: null,
        tags: ["nutrition"],
        author: "Dr. Mary",
      });
      expect(updated?.title).toBe("Weaning, Revised");
      expect(updated?.coverImageUrl).toBeNull();
    });

    it("returns null updating an unknown id", async () => {
      const updated = await updateArticle(dbh.db, "00000000-0000-0000-0000-000000000000", {
        ...base,
        coverImageUrl: null,
      });
      expect(updated).toBeNull();
    });

    it("rejects an update that collides with another article's slug", async () => {
      const actor = await seedActor();
      await createArticle(dbh.db, { ...base, slug: "first", createdBy: actor });
      const b = await createArticle(dbh.db, { ...base, slug: "second", createdBy: actor });
      await expect(
        updateArticle(dbh.db, b.id, { ...base, slug: "first", coverImageUrl: null }),
      ).rejects.toBeInstanceOf(ArticleSlugTakenError);
    });

    it("rejects an update with an unsafe coverImageUrl scheme", async () => {
      const actor = await seedActor();
      const a = await createArticle(dbh.db, { ...base, createdBy: actor });
      await expect(
        updateArticle(dbh.db, a.id, { ...base, coverImageUrl: "javascript:alert(1)" }),
      ).rejects.toBeInstanceOf(ArticleValidationError);
    });

    it("allows an update that keeps the same slug", async () => {
      const actor = await seedActor();
      const a = await createArticle(dbh.db, { ...base, createdBy: actor });
      const updated = await updateArticle(dbh.db, a.id, {
        ...base,
        title: "Same slug, new title",
        coverImageUrl: null,
      });
      expect(updated?.title).toBe("Same slug, new title");
    });
  });

  describe("publish / unpublish (AC1)", () => {
    it("publish flips status + stamps published_at and makes it public", async () => {
      const actor = await seedActor();
      const a = await createArticle(dbh.db, { ...base, createdBy: actor });
      expect(await getPublishedArticle(dbh.db, a.slug)).toBeNull(); // draft hidden

      const pub = await publishArticle(dbh.db, a.id);
      expect(pub?.status).toBe("published");
      expect(pub?.publishedAt).not.toBeNull();

      const got = await getPublishedArticle(dbh.db, a.slug);
      expect(got?.slug).toBe(a.slug);
    });

    it("unpublish reverts to draft and removes it from the public surface", async () => {
      const actor = await seedActor();
      const a = await createArticle(dbh.db, { ...base, createdBy: actor });
      await publishArticle(dbh.db, a.id);
      const un = await unpublishArticle(dbh.db, a.id);
      expect(un?.status).toBe("draft");
      expect(await getPublishedArticle(dbh.db, a.slug)).toBeNull();
    });

    it("publish returns null for an unknown id", async () => {
      expect(await publishArticle(dbh.db, "00000000-0000-0000-0000-000000000000")).toBeNull();
    });
  });

  describe("public list (AC3)", () => {
    it("returns published articles newest-first; excludes drafts", async () => {
      const actor = await seedActor();
      const a = await createArticle(dbh.db, { ...base, slug: "older", createdBy: actor });
      const b = await createArticle(dbh.db, { ...base, slug: "newer", createdBy: actor });
      const draft = await createArticle(dbh.db, { ...base, slug: "hidden-draft", createdBy: actor });

      await publishArticle(dbh.db, a.id);
      // Ensure a strictly-later publish timestamp for deterministic ordering.
      await new Promise((r) => setTimeout(r, 5));
      await publishArticle(dbh.db, b.id);
      void draft; // never published

      const list = await listPublishedArticles(dbh.db);
      expect(list.map((x) => x.slug)).toEqual(["newer", "older"]);
      expect(list.find((x) => x.slug === "hidden-draft")).toBeUndefined();
    });

    it("filters by tag (only published rows carrying the tag)", async () => {
      const actor = await seedActor();
      const sleep = await createArticle(dbh.db, {
        ...base,
        slug: "sleep-tips",
        tags: ["sleep"],
        createdBy: actor,
      });
      const food = await createArticle(dbh.db, {
        ...base,
        slug: "food-tips",
        tags: ["nutrition"],
        createdBy: actor,
      });
      await publishArticle(dbh.db, sleep.id);
      await publishArticle(dbh.db, food.id);

      const list = await listPublishedArticles(dbh.db, { tag: "sleep" });
      expect(list.map((x) => x.slug)).toEqual(["sleep-tips"]);
    });
  });

  describe("detail + admin reads", () => {
    it("getPublishedArticle returns null for a draft slug (drafts never public)", async () => {
      const actor = await seedActor();
      await createArticle(dbh.db, { ...base, createdBy: actor });
      expect(await getPublishedArticle(dbh.db, base.slug)).toBeNull();
    });

    it("getArticle / getArticleBySlug return drafts for the admin", async () => {
      const actor = await seedActor();
      const a = await createArticle(dbh.db, { ...base, createdBy: actor });
      expect((await getArticle(dbh.db, a.id))?.slug).toBe(base.slug);
      expect((await getArticleBySlug(dbh.db, base.slug))?.id).toBe(a.id);
    });

    it("listArticlesForAdmin returns all rows (drafts + published), newest-first", async () => {
      const actor = await seedActor();
      const a = await createArticle(dbh.db, { ...base, slug: "one", createdBy: actor });
      await new Promise((r) => setTimeout(r, 5));
      const b = await createArticle(dbh.db, { ...base, slug: "two", createdBy: actor });
      await publishArticle(dbh.db, a.id);
      const list = await listArticlesForAdmin(dbh.db);
      expect(list.map((x) => x.slug)).toEqual(["two", "one"]);
    });
  });
});
