import { describe, expect, it } from "vitest";
import { impersonationBanner, ACTING_AS_HEADER } from "./impersonation-banner.js";

describe("impersonationBanner (P1-E01-S06 AC3)", () => {
  it("uses the agreed acting-as header name", () => {
    expect(ACTING_AS_HEADER).toBe("x-bm-acting-as");
  });

  it("is inactive when no acting-as id is present", () => {
    expect(impersonationBanner(null)).toEqual({ active: false, message: null });
    expect(impersonationBanner(undefined)).toEqual({ active: false, message: null });
    expect(impersonationBanner("   ")).toEqual({ active: false, message: null });
  });

  it("shows a visible banner naming the impersonated user when active", () => {
    const state = impersonationBanner("parent-9");
    expect(state.active).toBe(true);
    expect(state.message).toContain("parent-9");
    expect(state.message).toContain("logged under your real account");
  });
});
