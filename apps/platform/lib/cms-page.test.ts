import { describe, expect, it, vi } from "vitest";
import {
  fetchPublishedUnitPage,
  resolveUnitPageView,
  type PublishedCmsPage,
} from "./cms-page";
import { getUnitPage } from "./unit-content";

/**
 * P6-E06-S03 (Story 36.3) — CMS-driven unit pages on the platform. The per-unit
 * public page renders admin-edited CMS content when a PUBLISHED page exists, and
 * falls back to the existing static `unit-content` model otherwise (AC1 fallback).
 */
describe("cms-page (P6-E06-S03 / Story 36.3)", () => {
  const cms: PublishedCmsPage = {
    slug: "play",
    heroCopy: "CMS-edited hero copy.",
    heroImageUrl: "https://cdn/play-hero.jpg",
    ctaLabel: "Reserve a spot",
    ctaHref: "/signup?from=play",
    bodySections: [
      { heading: "Sensory zones", body: "Squishy mats and bubbles." },
      { heading: "Drop-in hours", body: "Any weekday morning." },
    ],
  };

  describe("resolveUnitPageView — published CMS content overrides static", () => {
    it("uses the CMS content when a published page is supplied", () => {
      const view = resolveUnitPageView("play", cms);
      expect(view).not.toBeNull();
      expect(view!.source).toBe("cms");
      expect(view!.heroCopy).toBe("CMS-edited hero copy.");
      expect(view!.heroImageSrc).toBe("https://cdn/play-hero.jpg");
      expect(view!.cta).toEqual({ label: "Reserve a spot", href: "/signup?from=play" });
      expect(view!.sections.map((s) => s.heading)).toEqual(["Sensory zones", "Drop-in hours"]);
    });

    it("falls back to the static unit page when no CMS page is supplied (AC1 fallback)", () => {
      const view = resolveUnitPageView("play", null);
      const staticPage = getUnitPage("play")!;
      expect(view).not.toBeNull();
      expect(view!.source).toBe("static");
      expect(view!.title).toBe(staticPage.title);
      expect(view!.heroCopy).toBe(staticPage.summary);
      expect(view!.heroImageSrc).toBe(staticPage.image.src);
      // The static examples become single-heading sections.
      expect(view!.sections.map((s) => s.heading)).toEqual([...staticPage.examples]);
    });

    it("returns null for an unknown slug with no CMS page (→ 404)", () => {
      expect(resolveUnitPageView("warehouse", null)).toBeNull();
    });

    it("renders an unknown slug ONLY when the CMS supplies it", () => {
      const shopCms: PublishedCmsPage = { ...cms, slug: "shop" };
      const view = resolveUnitPageView("shop", shopCms);
      expect(view).not.toBeNull();
      expect(view!.source).toBe("cms");
    });
  });

  describe("fetchPublishedUnitPage — graceful, never throws", () => {
    it("returns the page on a 200", async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ page: cms }),
      }) as unknown as typeof fetch;
      const page = await fetchPublishedUnitPage("play", { fetchImpl, apiBaseUrl: "http://api" });
      expect(page?.heroCopy).toBe("CMS-edited hero copy.");
      expect(fetchImpl).toHaveBeenCalledWith("http://api/public/cms-pages/play");
    });

    it("returns null on a 404 (no published override)", async () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
      expect(await fetchPublishedUnitPage("play", { fetchImpl })).toBeNull();
    });

    it("returns null on a network error (never crashes the page)", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error("boom")) as unknown as typeof fetch;
      expect(await fetchPublishedUnitPage("play", { fetchImpl })).toBeNull();
    });
  });
});
