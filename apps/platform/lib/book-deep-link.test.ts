import { describe, expect, it } from "vitest";
import {
  ACQUISITION_COOKIE_NAME,
  ACQUISITION_COOKIE_MAX_AGE,
  isBookableUnit,
  resolveDeepLink,
} from "./book-deep-link";

describe("WhatsApp deep-link routing (P1-E12-S03)", () => {
  describe("isBookableUnit (AC1)", () => {
    it("accepts the five known unit slugs", () => {
      for (const slug of ["play", "talent", "salon", "events", "coaching"]) {
        expect(isBookableUnit(slug)).toBe(true);
      }
    });
    it("rejects unknown slugs (and never /shop)", () => {
      expect(isBookableUnit("shop")).toBe(false);
      expect(isBookableUnit("nope")).toBe(false);
      expect(isBookableUnit("")).toBe(false);
    });
  });

  describe("resolveDeepLink (AC1)", () => {
    it("returns notFound for an unknown unit", () => {
      const out = resolveDeepLink("nope", { utm_source: "whatsapp" });
      expect(out.notFound).toBe(true);
    });

    it("pre-selects the unit and captures UTM, routing to the signup CTA", () => {
      const out = resolveDeepLink("play", {
        utm_source: "whatsapp",
        utm_campaign: "play-launch",
      });
      expect(out.notFound).toBe(false);
      expect(out.unit).toBe("play");
      // CTA carries the pre-selected unit so the post-signup funnel resumes there.
      expect(out.redirectTo).toBe("/signup?unit=play");
      expect(out.acquisition).toEqual({ source: "whatsapp", campaign: "play-launch" });
      expect(out.acquisitionCookieValue).toBe(
        JSON.stringify({ source: "whatsapp", campaign: "play-launch" }),
      );
    });

    it("routes a no-UTM (organic) deep-link with no acquisition cookie", () => {
      const out = resolveDeepLink("salon", {});
      expect(out.notFound).toBe(false);
      expect(out.unit).toBe("salon");
      expect(out.redirectTo).toBe("/signup?unit=salon");
      expect(out.acquisition).toBeNull();
      expect(out.acquisitionCookieValue).toBeNull();
    });

    it("exposes a scoped, time-bounded cookie name", () => {
      expect(ACQUISITION_COOKIE_NAME).toBe("bm_acq");
      expect(ACQUISITION_COOKIE_MAX_AGE).toBeGreaterThan(0);
    });
  });
});
