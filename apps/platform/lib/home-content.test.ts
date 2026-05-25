import { describe, expect, it } from "vitest";
import {
  HOME_HERO,
  HOME_UNITS,
  LCP_BUDGET_MS,
  SIGN_UP_HREF,
  TOY_SHOP_URL,
  isExternalUnit,
  unitLinkAttrs,
  withinLcpBudget,
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
