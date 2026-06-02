import { describe, expect, it } from "vitest";
import { isPublicPath } from "./middleware";

/**
 * SSO edge guard — public-path predicate (P1-E01-S04 + P3-E02-S01 AC1). Asserts
 * the deliberately-public `/staff-earnings` route sits OUTSIDE the session gate,
 * while ordinary admin routes remain gated.
 */
describe("isPublicPath", () => {
  it("treats /staff-earnings as public — no login required (P3-E02-S01 AC1)", () => {
    expect(isPublicPath("/staff-earnings")).toBe(true);
    expect(isPublicPath("/staff-earnings/")).toBe(true);
  });

  it("keeps the login + framework asset paths public", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/_next/static/chunk.js")).toBe(true);
  });

  it("still gates ordinary admin routes behind the session", () => {
    expect(isPublicPath("/staff")).toBe(false);
    expect(isPublicPath("/commission-runs")).toBe(false);
    expect(isPublicPath("/treasury")).toBe(false);
  });
});
