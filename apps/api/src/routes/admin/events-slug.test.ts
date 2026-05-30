import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "./events-slug.js";

describe("slugify", () => {
  it("lowercases, strips punctuation and collapses separators", () => {
    expect(slugify("Spring Recital 2026!")).toBe("spring-recital-2026");
    expect(slugify("  Reading   Corner  ")).toBe("reading-corner");
  });

  it("strips accents", () => {
    expect(slugify("Café Crème")).toBe("cafe-creme");
  });

  it("falls back to 'event' for empty results", () => {
    expect(slugify("!!!")).toBe("event");
    expect(slugify("")).toBe("event");
  });

  it("caps length and never leaves a trailing dash", () => {
    const s = slugify("a".repeat(200));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", () => {
    expect(uniqueSlug("Gala", new Set())).toBe("gala");
  });

  it("suffixes on collision", () => {
    expect(uniqueSlug("Gala", new Set(["gala"]))).toBe("gala-2");
    expect(uniqueSlug("Gala", new Set(["gala", "gala-2"]))).toBe("gala-3");
  });
});
