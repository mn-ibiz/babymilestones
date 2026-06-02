import { describe, expect, it } from "vitest";
import {
  CMS_PAGE_SLUGS,
  isCmsPageSlug,
  cmsBodySectionSchema,
  cmsPageContentSchema,
  cmsPageSaveSchema,
} from "./index.js";

/**
 * P6-E06-S03 (Story 36.3) — CMS-driven unit pages contracts. Zod schemas the
 * admin Pages CRUD surface validates against; mirror the catalog validation +
 * the DB CHECKs. The known page slugs are the routable unit keys.
 */
describe("cms-pages contracts (P6-E06-S03 / Story 36.3)", () => {
  it("the known slugs are the routable unit keys", () => {
    expect(CMS_PAGE_SLUGS).toEqual(["play", "talent", "salon", "events", "coaching", "shop"]);
  });

  it("isCmsPageSlug narrows known keys; rejects junk", () => {
    expect(isCmsPageSlug("play")).toBe(true);
    expect(isCmsPageSlug("shop")).toBe(true);
    expect(isCmsPageSlug("warehouse")).toBe(false);
    expect(isCmsPageSlug("")).toBe(false);
    expect(isCmsPageSlug(123)).toBe(false);
  });

  describe("cmsBodySectionSchema", () => {
    it("accepts a heading + body section", () => {
      const r = cmsBodySectionSchema.safeParse({ heading: "What we offer", body: "Soft play." });
      expect(r.success).toBe(true);
    });

    it("rejects a section with an empty heading", () => {
      const r = cmsBodySectionSchema.safeParse({ heading: "", body: "x" });
      expect(r.success).toBe(false);
    });
  });

  describe("cmsPageContentSchema", () => {
    const valid = {
      heroCopy: "Open play sessions.",
      heroImageUrl: "https://x/y.jpg",
      ctaLabel: "Book now",
      ctaHref: "/signup",
      bodySections: [{ heading: "What we offer", body: "Soft play." }],
    };

    it("accepts a full page content payload", () => {
      expect(cmsPageContentSchema.safeParse(valid).success).toBe(true);
    });

    it("defaults bodySections to an empty array when absent", () => {
      const r = cmsPageContentSchema.parse({
        heroCopy: "",
        heroImageUrl: "",
        ctaLabel: "",
        ctaHref: "",
      });
      expect(r.bodySections).toEqual([]);
    });

    it("rejects body sections that are not an array", () => {
      const r = cmsPageContentSchema.safeParse({ ...valid, bodySections: "nope" });
      expect(r.success).toBe(false);
    });
  });

  describe("cmsPageSaveSchema", () => {
    it("accepts a save payload with a known slug + content", () => {
      const r = cmsPageSaveSchema.safeParse({
        slug: "play",
        heroCopy: "Hi",
        heroImageUrl: "",
        ctaLabel: "Book",
        ctaHref: "/x",
        bodySections: [],
      });
      expect(r.success).toBe(true);
    });

    it("rejects an unknown slug", () => {
      const r = cmsPageSaveSchema.safeParse({
        slug: "warehouse",
        heroCopy: "Hi",
        heroImageUrl: "",
        ctaLabel: "",
        ctaHref: "",
        bodySections: [],
      });
      expect(r.success).toBe(false);
    });
  });
});
