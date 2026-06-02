import { describe, expect, it } from "vitest";
import {
  HOME_HERO,
  HOME_UNITS,
  LCP_BUDGET_MS,
  SIGN_UP_HREF,
  TESTIMONIALS_HEADING,
  TOY_SHOP_URL,
  fetchHomeTestimonials,
  homeTestimonials,
  isExternalUnit,
  unitLinkAttrs,
  withinLcpBudget,
  type PublicReviewSnippet,
} from "./home-content";

describe("home hero (AC1)", () => {
  it("exposes a headline, a real-child photo, and the fixed CTA label", () => {
    expect(HOME_HERO.headline.length).toBeGreaterThan(0);
    expect(HOME_HERO.image.src).toBe("/home/hero-child.jpg");
    expect(HOME_HERO.image.alt.length).toBeGreaterThan(0);
    expect(HOME_HERO.cta.label).toBe("Top up & book");
  });

  it("points the CTA at the sign-up entry", () => {
    expect(HOME_HERO.cta.href).toBe(SIGN_UP_HREF);
  });
});

describe("unit strip (AC2)", () => {
  it("lists exactly Play / Talent / Salon / Toy Shop in order", () => {
    expect(HOME_UNITS.map((u) => u.label)).toEqual([
      "Play",
      "Talent",
      "Salon",
      "Toy Shop",
    ]);
  });

  it("routes the three internal units into the sign-up funnel", () => {
    for (const unit of HOME_UNITS.filter((u) => u.key !== "shop")) {
      expect(unit.external).toBe(false);
      expect(unit.href).toBe(SIGN_UP_HREF);
    }
  });

  it("links Toy Shop out to the standalone WooCommerce site", () => {
    const shop = HOME_UNITS.find((u) => u.key === "shop");
    expect(shop?.external).toBe(true);
    expect(shop?.href).toBe(TOY_SHOP_URL);
    expect(TOY_SHOP_URL.startsWith("https://")).toBe(true);
  });

  it("has exactly one external unit (the toy shop)", () => {
    expect(HOME_UNITS.filter(isExternalUnit)).toHaveLength(1);
  });
});

describe("unitLinkAttrs", () => {
  it("opens external units safely in a new tab", () => {
    const shop = HOME_UNITS.find((u) => u.key === "shop")!;
    expect(unitLinkAttrs(shop)).toEqual({
      href: TOY_SHOP_URL,
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("keeps internal units in-app with no target/rel", () => {
    const play = HOME_UNITS.find((u) => u.key === "play")!;
    expect(unitLinkAttrs(play)).toEqual({ href: SIGN_UP_HREF });
  });
});

describe("LCP budget (AC4)", () => {
  it("targets sub-2s LCP on 3G", () => {
    expect(LCP_BUDGET_MS).toBe(2000);
  });

  it("accepts at/under budget and rejects slower", () => {
    expect(withinLcpBudget(0)).toBe(true);
    expect(withinLcpBudget(LCP_BUDGET_MS)).toBe(true);
    expect(withinLcpBudget(LCP_BUDGET_MS + 1)).toBe(false);
  });
});

describe("home testimonials (P6-E04-S04 / Story 34.4 AC2)", () => {
  const snippets: PublicReviewSnippet[] = [
    { id: "a", quote: " Magic place ", attributionLabel: " Parent of two, Nairobi " },
    { id: "b", quote: "", attributionLabel: "Parent, Mombasa" },
    { id: "c", quote: "Lovely", attributionLabel: "  " },
  ];

  it("renders the published snippets as anonymised testimonial cards", () => {
    const cards = homeTestimonials([snippets[0]!]);
    expect(cards).toEqual([{ id: "a", quote: "Magic place", attribution: "Parent of two, Nairobi" }]);
  });

  it("drops snippets with an empty quote or attribution", () => {
    expect(homeTestimonials(snippets).map((c) => c.id)).toEqual(["a"]);
  });

  it("never carries a parent identity — only id/quote/attribution", () => {
    const card = homeTestimonials([snippets[0]!])[0]!;
    expect(Object.keys(card).sort()).toEqual(["attribution", "id", "quote"]);
  });

  it("has a section heading", () => {
    expect(TESTIMONIALS_HEADING.length).toBeGreaterThan(0);
  });

  it("fetchHomeTestimonials maps the public endpoint payload", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({ snippets: [{ id: "a", quote: "Wow", attributionLabel: "Parent of one, Kisumu" }] }),
    })) as unknown as typeof fetch;
    const cards = await fetchHomeTestimonials({ apiBaseUrl: "http://x", fetchImpl });
    expect(cards).toEqual([{ id: "a", quote: "Wow", attribution: "Parent of one, Kisumu" }]);
  });

  it("fetchHomeTestimonials returns an empty list on a network failure (never crashes the home page)", async () => {
    const fetchImpl = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect(await fetchHomeTestimonials({ apiBaseUrl: "http://x", fetchImpl })).toEqual([]);
  });

  it("fetchHomeTestimonials returns an empty list on a non-2xx response", async () => {
    const fetchImpl = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await fetchHomeTestimonials({ apiBaseUrl: "http://x", fetchImpl })).toEqual([]);
  });
});
