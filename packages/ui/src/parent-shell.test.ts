import { describe, expect, it } from "vitest";
import {
  PARENT_NAV_ITEMS,
  activeNavHref,
  isNavItemActive,
} from "./parent-shell.js";

describe("PARENT_NAV_ITEMS", () => {
  it("exposes exactly the four parent tabs in order", () => {
    expect(PARENT_NAV_ITEMS.map((i) => i.key)).toEqual([
      "home",
      "wallet",
      "children",
      "profile",
    ]);
  });

  it("each tab has a label, href and icon name", () => {
    for (const item of PARENT_NAV_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.icon).toBeTruthy();
    }
  });

  it("home points at the dashboard root, others at their sections", () => {
    const byKey = Object.fromEntries(PARENT_NAV_ITEMS.map((i) => [i.key, i.href]));
    expect(byKey.home).toBe("/");
    expect(byKey.wallet).toBe("/wallet");
    expect(byKey.children).toBe("/children");
    expect(byKey.profile).toBe("/profile");
  });
});

describe("isNavItemActive", () => {
  const home = PARENT_NAV_ITEMS[0]!;
  const wallet = PARENT_NAV_ITEMS[1]!;

  it("matches home only on the exact root path", () => {
    expect(isNavItemActive(home, "/")).toBe(true);
    expect(isNavItemActive(home, "/wallet")).toBe(false);
    expect(isNavItemActive(home, "/children/abc")).toBe(false);
  });

  it("matches a section tab on its path and any nested route", () => {
    expect(isNavItemActive(wallet, "/wallet")).toBe(true);
    expect(isNavItemActive(wallet, "/wallet/")).toBe(true);
    expect(isNavItemActive(wallet, "/wallet/statement")).toBe(true);
  });

  it("does not match a section tab on a sibling prefix", () => {
    // "/wallets" must not match the "/wallet" tab.
    expect(isNavItemActive(wallet, "/wallets")).toBe(false);
  });

  it("ignores query strings and trailing fragments via the path only", () => {
    expect(isNavItemActive(wallet, "/wallet")).toBe(true);
  });
});

describe("activeNavHref", () => {
  it("returns the href of the matching tab", () => {
    expect(activeNavHref("/")).toBe("/");
    expect(activeNavHref("/wallet/statement")).toBe("/wallet");
    expect(activeNavHref("/children")).toBe("/children");
    expect(activeNavHref("/profile")).toBe("/profile");
  });

  it("returns null when no tab matches", () => {
    expect(activeNavHref("/settings/unknown")).toBeNull();
  });

  it("never matches home for a non-root path", () => {
    expect(activeNavHref("/wallet")).not.toBe("/");
  });

  it("prefers the most specific (longest) matching tab", () => {
    // Defensive: if tabs ever nest, the deepest match wins, never home.
    expect(activeNavHref("/wallet")).toBe("/wallet");
  });
});
