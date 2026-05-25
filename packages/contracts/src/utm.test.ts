import { describe, expect, it } from "vitest";
import {
  UTM_PARAM_KEYS,
  acquisitionSourceSchema,
  parseUtmParams,
  serializeAcquisitionSource,
  type AcquisitionSource,
} from "./utm.js";

describe("UTM capture (P1-E12-S03)", () => {
  describe("parseUtmParams (AC1)", () => {
    it("captures the standard utm_* params from a query record", () => {
      const out = parseUtmParams({
        utm_source: "whatsapp",
        utm_medium: "social",
        utm_campaign: "play-launch",
        utm_term: "soft-play",
        utm_content: "ad-a",
      });
      expect(out).toEqual({
        source: "whatsapp",
        medium: "social",
        campaign: "play-launch",
        term: "soft-play",
        content: "ad-a",
      });
    });

    it("ignores non-utm params and unknown keys", () => {
      const out = parseUtmParams({ utm_source: "whatsapp", foo: "bar", ref: "x" });
      expect(out).toEqual({ source: "whatsapp" });
    });

    it("trims whitespace and drops empty values", () => {
      const out = parseUtmParams({ utm_source: "  whatsapp  ", utm_medium: "   " });
      expect(out).toEqual({ source: "whatsapp" });
    });

    it("returns null when no utm params are present (no attribution)", () => {
      expect(parseUtmParams({})).toBeNull();
      expect(parseUtmParams({ foo: "bar" })).toBeNull();
    });

    it("takes the first value when a param repeats (array)", () => {
      const out = parseUtmParams({ utm_source: ["whatsapp", "ig"] });
      expect(out).toEqual({ source: "whatsapp" });
    });

    it("clamps an over-long value to the max length", () => {
      const long = "x".repeat(500);
      const out = parseUtmParams({ utm_campaign: long });
      expect(out?.campaign).toHaveLength(200);
    });

    it("exposes the five canonical utm keys", () => {
      expect(UTM_PARAM_KEYS).toEqual([
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
      ]);
    });
  });

  describe("acquisitionSourceSchema (AC2)", () => {
    it("accepts a partial UTM payload", () => {
      const parsed = acquisitionSourceSchema.parse({ source: "whatsapp", campaign: "play" });
      expect(parsed).toEqual({ source: "whatsapp", campaign: "play" });
    });

    it("strips unknown keys", () => {
      const parsed = acquisitionSourceSchema.parse({ source: "whatsapp", evil: "x" } as AcquisitionSource);
      expect(parsed).toEqual({ source: "whatsapp" });
    });

    it("rejects an empty object (no signal to attribute)", () => {
      expect(acquisitionSourceSchema.safeParse({}).success).toBe(false);
    });

    it("rejects an over-long value", () => {
      expect(acquisitionSourceSchema.safeParse({ source: "x".repeat(201) }).success).toBe(false);
    });
  });

  describe("serializeAcquisitionSource (cookie round-trip)", () => {
    it("round-trips through JSON", () => {
      const src: AcquisitionSource = { source: "whatsapp", campaign: "play" };
      const json = serializeAcquisitionSource(src);
      expect(json).not.toBeNull();
      expect(JSON.parse(json!)).toEqual(src);
    });

    it("returns null for a null/empty source", () => {
      expect(serializeAcquisitionSource(null)).toBeNull();
    });
  });
});
