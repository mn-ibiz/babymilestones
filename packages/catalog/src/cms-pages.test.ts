import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { users } from "@bm/db";
import {
  CMS_PAGE_SLUGS,
  isCmsPageSlug,
  savePage,
  publishPage,
  getPage,
  getDraftPage,
  getPublishedPage,
  listPageRevisions,
  listPages,
  CmsPageValidationError,
} from "./cms-pages.js";

/**
 * P6-E06-S03 (Story 36.3) — CMS-driven unit pages module. DB-backed via PGlite.
 * Covers: save (create + update, AC1) with a revision on EVERY save (AC3); the
 * draft/published separation (AC2) — getDraftPage sees in-progress edits while
 * getPublishedPage sees only the last published; publish flips status + stamps
 * published_at + retains a revision; slug + body-section validation.
 */
describe("cms-pages module (P6-E06-S03 / Story 36.3)", () => {
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

  const content = {
    heroCopy: "Open play sessions for little ones.",
    heroImageUrl: "https://x/play.jpg",
    ctaLabel: "Book now",
    ctaHref: "/signup",
    bodySections: [
      { heading: "What we offer", body: "Soft play & sensory zones." },
      { heading: "Hours", body: "Drop in any time." },
    ],
  };

  describe("slug taxonomy", () => {
    it("includes the routable unit keys plus shop", () => {
      expect(CMS_PAGE_SLUGS).toEqual(["play", "talent", "salon", "events", "coaching", "shop"]);
    });
    it("narrows known slugs; rejects junk", () => {
      expect(isCmsPageSlug("salon")).toBe(true);
      expect(isCmsPageSlug("warehouse")).toBe(false);
    });
  });

  describe("save (AC1) + revision-on-save (AC3)", () => {
    it("creates a draft page on first save with a revision", async () => {
      const actor = await seedActor();
      const page = await savePage(dbh.db, { slug: "play", ...content, updatedBy: actor });
      expect(page.slug).toBe("play");
      expect(page.status).toBe("draft");
      expect(page.publishedAt).toBeNull();
      expect(page.bodySections).toHaveLength(2);

      const revs = await listPageRevisions(dbh.db, page.id);
      expect(revs).toHaveLength(1);
      expect(revs[0]!.snapshot.heroCopy).toBe(content.heroCopy);
    });

    it("updates the same page (upsert by slug) and appends a second revision", async () => {
      const actor = await seedActor();
      const first = await savePage(dbh.db, { slug: "play", ...content, updatedBy: actor });
      const second = await savePage(dbh.db, {
        slug: "play",
        ...content,
        heroCopy: "Edited hero copy.",
        updatedBy: actor,
      });
      expect(second.id).toBe(first.id); // same row — one page per slug
      expect(second.heroCopy).toBe("Edited hero copy.");

      const revs = await listPageRevisions(dbh.db, first.id);
      expect(revs).toHaveLength(2); // AC3: a revision per save
      // Newest first.
      expect(revs[0]!.snapshot.heroCopy).toBe("Edited hero copy.");
      expect(revs[1]!.snapshot.heroCopy).toBe(content.heroCopy);
    });

    it("rejects an unknown slug", async () => {
      const actor = await seedActor();
      await expect(
        savePage(dbh.db, { slug: "warehouse", ...content, updatedBy: actor }),
      ).rejects.toBeInstanceOf(CmsPageValidationError);
    });

    it("rejects a body section with an empty heading", async () => {
      const actor = await seedActor();
      await expect(
        savePage(dbh.db, {
          slug: "play",
          ...content,
          bodySections: [{ heading: "", body: "x" }],
          updatedBy: actor,
        }),
      ).rejects.toBeInstanceOf(CmsPageValidationError);
    });
  });

  describe("draft vs published separation (AC2)", () => {
    it("a freshly-saved (unpublished) page is NOT visible to the public", async () => {
      const actor = await seedActor();
      await savePage(dbh.db, { slug: "play", ...content, updatedBy: actor });
      expect(await getPublishedPage(dbh.db, "play")).toBeNull();
      const draft = await getDraftPage(dbh.db, "play");
      expect(draft?.heroCopy).toBe(content.heroCopy);
    });

    it("publish flips status, stamps published_at, retains a revision, and goes public (AC2/AC3)", async () => {
      const actor = await seedActor();
      const saved = await savePage(dbh.db, { slug: "play", ...content, updatedBy: actor });
      const published = await publishPage(dbh.db, { slug: "play", publishedBy: actor });
      expect(published?.status).toBe("published");
      expect(published?.publishedAt).not.toBeNull();

      const pub = await getPublishedPage(dbh.db, "play");
      expect(pub?.heroCopy).toBe(content.heroCopy);

      // AC3: publish also appends a revision (now 2: the save + the publish).
      const revs = await listPageRevisions(dbh.db, saved.id);
      expect(revs).toHaveLength(2);
      expect(revs[0]!.snapshot.status).toBe("published");
    });

    it("editing a published page reverts it to draft; public keeps the LAST published until re-publish", async () => {
      const actor = await seedActor();
      await savePage(dbh.db, { slug: "play", ...content, updatedBy: actor });
      await publishPage(dbh.db, { slug: "play", publishedBy: actor });

      // Edit after publish: status reverts to draft.
      const edited = await savePage(dbh.db, {
        slug: "play",
        ...content,
        heroCopy: "Draft-in-progress copy.",
        updatedBy: actor,
      });
      expect(edited.status).toBe("draft");

      // The PUBLIC still sees the original published copy (the edit is a draft).
      const pub = await getPublishedPage(dbh.db, "play");
      expect(pub?.heroCopy).toBe(content.heroCopy);
      // The admin PREVIEW sees the in-progress edit.
      const draft = await getDraftPage(dbh.db, "play");
      expect(draft?.heroCopy).toBe("Draft-in-progress copy.");

      // Re-publish: the public now sees the new copy.
      await publishPage(dbh.db, { slug: "play", publishedBy: actor });
      const pub2 = await getPublishedPage(dbh.db, "play");
      expect(pub2?.heroCopy).toBe("Draft-in-progress copy.");
    });

    it("publishPage returns null for a slug with no page", async () => {
      const actor = await seedActor();
      expect(await publishPage(dbh.db, { slug: "salon", publishedBy: actor })).toBeNull();
    });
  });

  describe("getPage + listPages", () => {
    it("getPage returns the row regardless of status", async () => {
      const actor = await seedActor();
      await savePage(dbh.db, { slug: "talent", ...content, updatedBy: actor });
      const page = await getPage(dbh.db, "talent");
      expect(page?.slug).toBe("talent");
    });

    it("listPages returns all pages ordered by slug", async () => {
      const actor = await seedActor();
      await savePage(dbh.db, { slug: "talent", ...content, updatedBy: actor });
      await savePage(dbh.db, { slug: "play", ...content, updatedBy: actor });
      const pages = await listPages(dbh.db);
      expect(pages.map((p) => p.slug)).toEqual(["play", "talent"]);
    });
  });
});
