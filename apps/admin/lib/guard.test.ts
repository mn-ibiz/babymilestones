import { describe, expect, it } from "vitest";
import { guardRoute, FORBIDDEN_PATH } from "./guard.js";

describe("guardRoute (AC2 — direct-URL access to a forbidden route)", () => {
  it("allows a permitted route", () => {
    const outcome = guardRoute("treasury", "/treasury/float-accounts");
    expect(outcome.ok).toBe(true);
  });

  it("denies a forbidden route and points at the 403 page", () => {
    const outcome = guardRoute("accountant", "/treasury/float-accounts");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(403);
      expect(outcome.redirectTo).toBe(FORBIDDEN_PATH);
    }
  });

  it("never short-circuits the forbidden page to itself (no redirect loop)", () => {
    const outcome = guardRoute("accountant", FORBIDDEN_PATH);
    expect(outcome.ok).toBe(true);
  });

  it("denies an unmapped route by default", () => {
    const outcome = guardRoute("super_admin", "/danger/zone");
    expect(outcome.ok).toBe(false);
  });

  it("matches nested segments to their owning route", () => {
    expect(guardRoute("treasury", "/treasury/reconciliation/export").ok).toBe(true);
    expect(guardRoute("accountant", "/treasury/reconciliation/export").ok).toBe(true);
  });
});
