import { describe, expect, it } from "vitest";
import {
  SIGN_UP_HREF,
  TOY_SHOP_URL,
  UNIT_PAGES,
  UNIT_SLUGS,
  bookNowHref,
  getUnitPage,
  isToyShopRoute,
  toyShopLinkAttrs,
  unitPublicPaths,
} from "./unit-content";
import { readFileSync } from "node:fs";

describe("unit pages (AC1) — the five routable units", () => {
  it("covers exactly /play, /talent, /salon, /events, /coaching in order", () => {
    expect(UNIT_SLUGS).toEqual(["play", "talent", "salon", "events", "coaching"]);
  });

  it("never includes a /shop route — the toy shop is external", () => {
    expect(UNIT_SLUGS).not.toContain("shop");
    expect(getUnitPage("shop")).toBeUndefined();
  });

  it("has a page for every slug and no orphan pages", () => {
    expect(UNIT_PAGES.map((p) => p.slug)).toEqual([...UNIT_SLUGS]);
  });
});

describe("getUnitPage (dynamic slug routing)", () => {
  it("resolves a known slug to its content", () => {
    const play = getUnitPage("play");
    expect(play?.slug).toBe("play");
    expect(play?.title.length).toBeGreaterThan(0);
  });

  it("returns undefined for an unknown slug (→ 404)", () => {
    expect(getUnitPage("nope")).toBeUndefined();
    expect(getUnitPage("")).toBeUndefined();
    expect(getUnitPage("PLAY")).toBeUndefined();
  });
});

describe("unit page content (AC2) — photo, copy, examples, CTA", () => {
  for (const slug of UNIT_SLUGS) {
    it(`${slug}: has a photo, short copy, examples and a Book now CTA`, () => {
      const page = getUnitPage(slug)!;
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.summary.length).toBeGreaterThan(0);
      // photo
      expect(page.image.src.startsWith("/units/")).toBe(true);
      expect(page.image.alt.length).toBeGreaterThan(0);
      // examples
      expect(page.examples.length).toBeGreaterThanOrEqual(2);
      for (const ex of page.examples) {
        expect(ex.length).toBeGreaterThan(0);
      }
      // CTA label fixed by AC2
      expect(page.cta.label).toBe("Book now");
    });
  }
});

describe("Book now CTA wiring (AC2) — signup when not logged in", () => {
  it("sends an unauthenticated visitor to the signup entry", () => {
    expect(bookNowHref(false)).toBe(SIGN_UP_HREF);
    for (const slug of UNIT_SLUGS) {
      expect(getUnitPage(slug)!.cta.href).toBe(SIGN_UP_HREF);
    }
  });

  it("sends an authenticated visitor straight into booking", () => {
    expect(bookNowHref(true)).not.toBe(SIGN_UP_HREF);
    expect(bookNowHref(true).startsWith("/")).toBe(true);
  });
});

describe("Toy Shop external link (AC1)", () => {
  it("is an absolute off-site WooCommerce URL", () => {
    expect(TOY_SHOP_URL.startsWith("https://")).toBe(true);
  });

  it("is never treated as an internal unit route", () => {
    expect(isToyShopRoute("/shop")).toBe(true);
    expect(isToyShopRoute("/play")).toBe(false);
    expect(UNIT_SLUGS).not.toContain("shop");
  });

  it("opens safely in a new tab", () => {
    expect(toyShopLinkAttrs()).toEqual({
      href: TOY_SHOP_URL,
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });
});

describe("public route allow-list (AC1) — unauth visitors can view units", () => {
  it("derives the five exact public unit paths", () => {
    expect(unitPublicPaths()).toEqual([
      "/play",
      "/talent",
      "/salon",
      "/events",
      "/coaching",
    ]);
  });

  it("middleware allow-lists every unit path (no login bounce)", () => {
    const mw = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
    for (const path of unitPublicPaths()) {
      expect(mw).toContain(`"${path}"`);
    }
    // ...and never exposes a /shop route.
    expect(mw).not.toContain('"/shop"');
  });
});
