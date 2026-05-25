import { describe, expect, it } from "vitest";
import { PARENT_NAV_ITEMS, activeNavHref } from "@bm/ui";
import { INITIAL_JS_BUDGET_BYTES, withinInitialJsBudget } from "./shell";

describe("parent shell nav wiring", () => {
  it("the authed group exposes Home / Wallet / Children / Profile in order", () => {
    expect(PARENT_NAV_ITEMS.map((i) => i.label)).toEqual([
      "Home",
      "Wallet",
      "Children",
      "Profile",
    ]);
  });

  it("active tab resolves to the section for nested routes", () => {
    expect(activeNavHref("/wallet/statement")).toBe("/wallet");
    expect(activeNavHref("/children")).toBe("/children");
    // Home is the authed dashboard at `/home` now (`/` is the public page).
    expect(activeNavHref("/home")).toBe("/home");
  });
});

describe("initial JS budget (AC3)", () => {
  it("caps initial JS at 200 KB gzipped", () => {
    expect(INITIAL_JS_BUDGET_BYTES).toBe(204_800);
  });

  it("accepts sizes at or under the ceiling and rejects larger", () => {
    expect(withinInitialJsBudget(0)).toBe(true);
    expect(withinInitialJsBudget(INITIAL_JS_BUDGET_BYTES)).toBe(true);
    expect(withinInitialJsBudget(INITIAL_JS_BUDGET_BYTES + 1)).toBe(false);
  });
});
