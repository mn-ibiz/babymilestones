import { describe, expect, it } from "vitest";
import {
  ARTICLE_STATUSES,
  isArticleStatus,
  isArticleSlug,
  articleSlugSchema,
  articleSaveSchema,
} from "./index.js";

/**
 * P6-E06-S04 (Story 36.4) — Blog / parenting stories contracts. Zod schemas the
 * admin Articles CRUD surface validates against; mirror the catalog validation +
 * the DB CHECKs. An article is a slugged, tagged, authored markdown post with a
 * draft/published lifecycle.
 */
describe("articles contracts (P6-E06-S04 / Story 36.4)", () => {
  it("the article statuses are draft + published", () => {
    expect(ARTICLE_STATUSES).toEqual(["draft", "published"]);
  });

  it("isArticleStatus narrows the known statuses", () => {
    expect(isArticleStatus("draft")).toBe(true);
    expect(isArticleStatus("published")).toBe(true);
    expect(isArticleStatus("archived")).toBe(false);
    expect(isArticleStatus(7)).toBe(false);
  });

  describe("articleSlugSchema", () => {
    it("accepts a lowercase kebab slug", () => {
      expect(articleSlugSchema.safeParse("first-steps-at-12-months").success).toBe(true);
      expect(isArticleSlug("weaning-101")).toBe(true);
    });

    it("rejects uppercase / spaces / leading or trailing / double hyphens", () => {
      expect(articleSlugSchema.safeParse("First-Steps").success).toBe(false);
      expect(articleSlugSchema.safeParse("first steps").success).toBe(false);
      expect(articleSlugSchema.safeParse("-leading").success).toBe(false);
      expect(articleSlugSchema.safeParse("trailing-").success).toBe(false);
      expect(articleSlugSchema.safeParse("double--hyphen").success).toBe(false);
      expect(articleSlugSchema.safeParse("").success).toBe(false);
      expect(isArticleSlug("Nope Nope")).toBe(false);
    });
  });

  describe("articleSaveSchema", () => {
    const valid = {
      slug: "weaning-101",
      title: "Weaning 101",
      bodyMd: "# Hello\n\nSome **bold** advice.",
      coverImageUrl: "https://cdn/x.jpg",
      tags: ["nutrition", "0-1y"],
      author: "Dr. Mary",
    };

    it("accepts a full save payload", () => {
      expect(articleSaveSchema.safeParse(valid).success).toBe(true);
    });

    it("defaults tags + coverImageUrl when absent", () => {
      const r = articleSaveSchema.parse({
        slug: "weaning-101",
        title: "Weaning 101",
        bodyMd: "Body.",
        author: "Dr. Mary",
      });
      expect(r.tags).toEqual([]);
      expect(r.coverImageUrl).toBeNull();
    });

    it("rejects an empty title", () => {
      expect(articleSaveSchema.safeParse({ ...valid, title: "  " }).success).toBe(false);
    });

    it("rejects an empty body", () => {
      expect(articleSaveSchema.safeParse({ ...valid, bodyMd: "" }).success).toBe(false);
    });

    it("rejects an empty author", () => {
      expect(articleSaveSchema.safeParse({ ...valid, author: "" }).success).toBe(false);
    });

    it("rejects an invalid slug", () => {
      expect(articleSaveSchema.safeParse({ ...valid, slug: "Not A Slug" }).success).toBe(false);
    });

    it("trims + drops blank tags", () => {
      const r = articleSaveSchema.parse({ ...valid, tags: [" nutrition ", "", "  ", "sleep"] });
      expect(r.tags).toEqual(["nutrition", "sleep"]);
    });
  });
});
