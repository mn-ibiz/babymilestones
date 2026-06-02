import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS,
  visibleNavFor,
  canAccessRoute,
  navItemForPath,
  floatStatusDot,
  headerViewModel,
  type FloatStatus,
} from "./nav.js";

describe("NAV_ITEMS catalogue (AC1)", () => {
  it("declares stable, unique hrefs and a permission per item", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.permission.action.length).toBeGreaterThan(0);
      expect(item.permission.resource.length).toBeGreaterThan(0);
    }
  });
});

describe("visibleNavFor (AC1 — server-side nav filtered by permission set)", () => {
  it("super_admin sees every nav item", () => {
    expect(visibleNavFor("super_admin")).toEqual(NAV_ITEMS);
  });

  it("treasury sees float + reconciliation but not staff/config", () => {
    const hrefs = visibleNavFor("treasury").map((i) => i.href);
    expect(hrefs).toContain("/treasury/float-accounts");
    expect(hrefs).toContain("/treasury/reconciliation");
    expect(hrefs).not.toContain("/staff");
    expect(hrefs).not.toContain("/sms-config");
  });

  it("admin sees staff + services + sms config but not treasury-only float management", () => {
    const hrefs = visibleNavFor("admin").map((i) => i.href);
    expect(hrefs).toContain("/staff");
    expect(hrefs).toContain("/services");
    expect(hrefs).toContain("/sms-config");
    // P1-E10-S03: admin holds read:audit, so the audit log viewer is visible.
    expect(hrefs).toContain("/audit");
    // P1-E10-S04: admin holds manage:config, so Settings is visible.
    expect(hrefs).toContain("/settings");
    // admin holds manage:user/service/config but not manage:float
    expect(hrefs).not.toContain("/treasury/float-accounts");
  });

  it("accountant (read-only) sees reconciliation read view, not float management or audit", () => {
    const hrefs = visibleNavFor("accountant").map((i) => i.href);
    expect(hrefs).toContain("/treasury/reconciliation");
    expect(hrefs).not.toContain("/treasury/float-accounts");
    expect(hrefs).not.toContain("/staff");
    // accountant does not hold read:audit.
    expect(hrefs).not.toContain("/audit");
    // accountant lacks manage:config → no Settings.
    expect(hrefs).not.toContain("/settings");
  });

  it("an unknown role sees nothing", () => {
    expect(visibleNavFor("nobody")).toEqual([]);
    expect(visibleNavFor("parent")).toEqual([]);
  });

  it("the salon report is visible to the read-report roles (P3-E03-S05)", () => {
    // admin / accountant / treasury / super_admin hold read:report.
    for (const role of ["admin", "accountant", "treasury", "super_admin"]) {
      expect(visibleNavFor(role).map((i) => i.href)).toContain("/salon-report");
    }
    // reception/parent never reach the admin console.
    expect(visibleNavFor("reception").map((i) => i.href)).not.toContain("/salon-report");
  });

  it("the feedback dashboard is visible to the read-report roles (P6-E04-S02 / Story 34.2)", () => {
    // admin / accountant / treasury / super_admin hold read:report.
    for (const role of ["admin", "accountant", "treasury", "super_admin"]) {
      expect(visibleNavFor(role).map((i) => i.href)).toContain("/feedback");
    }
    // reception/parent never reach the admin console.
    expect(visibleNavFor("reception").map((i) => i.href)).not.toContain("/feedback");
    expect(visibleNavFor("parent").map((i) => i.href)).not.toContain("/feedback");
  });

  it("the operations dashboard is visible to admin/super_admin/treasury only (P3-E05-S01 AC4)", () => {
    for (const role of ["admin", "super_admin", "treasury"]) {
      expect(visibleNavFor(role).map((i) => i.href)).toContain("/operations");
    }
    // Narrower than read-report: accountant holds read:report but NOT this view.
    expect(visibleNavFor("accountant").map((i) => i.href)).not.toContain("/operations");
    expect(visibleNavFor("reception").map((i) => i.href)).not.toContain("/operations");
  });

  it("the top-staff leaderboard is visible to admin/super_admin/treasury only (P3-E05-S03)", () => {
    for (const role of ["admin", "super_admin", "treasury"]) {
      expect(visibleNavFor(role).map((i) => i.href)).toContain("/operations/leaderboard");
    }
    // Narrower than read-report: accountant holds read:report but NOT this view.
    expect(visibleNavFor("accountant").map((i) => i.href)).not.toContain("/operations/leaderboard");
    expect(visibleNavFor("reception").map((i) => i.href)).not.toContain("/operations/leaderboard");
  });

  it("never leaks an item the role lacks permission for", () => {
    for (const role of ["admin", "treasury", "accountant", "super_admin", "parent"]) {
      for (const item of visibleNavFor(role)) {
        expect(canAccessRoute(role, item.href)).toBe(true);
      }
    }
  });
});

describe("canAccessRoute predicate (AC2 — route guard)", () => {
  it("grants the dashboard root to any admin-family role", () => {
    expect(canAccessRoute("accountant", "/")).toBe(true);
    expect(canAccessRoute("treasury", "/")).toBe(true);
  });

  it("matches nested segments to their owning nav item", () => {
    expect(canAccessRoute("treasury", "/treasury/float-accounts")).toBe(true);
    expect(canAccessRoute("treasury", "/treasury/reconciliation/export")).toBe(true);
    expect(canAccessRoute("accountant", "/treasury/float-accounts")).toBe(false);
  });

  it("denies a known route when the role lacks the permission", () => {
    expect(canAccessRoute("accountant", "/staff")).toBe(false);
    expect(canAccessRoute("treasury", "/sms-config")).toBe(false);
  });

  it("gates the operations dashboard route to admin/super_admin/treasury (P3-E05-S01 AC4)", () => {
    expect(canAccessRoute("admin", "/operations")).toBe(true);
    expect(canAccessRoute("super_admin", "/operations")).toBe(true);
    expect(canAccessRoute("treasury", "/operations")).toBe(true);
    expect(canAccessRoute("treasury", "/operations/revenue")).toBe(true);
    expect(canAccessRoute("accountant", "/operations")).toBe(false);
    expect(canAccessRoute("reception", "/operations")).toBe(false);
  });

  it("denies the forbidden page is not itself gated (always reachable)", () => {
    // /forbidden is the 403 destination — must never short-circuit to itself.
    expect(canAccessRoute("parent", "/forbidden")).toBe(true);
    expect(canAccessRoute("accountant", "/forbidden")).toBe(true);
  });

  it("denies an unmapped route by default (deny-by-default)", () => {
    expect(canAccessRoute("super_admin", "/totally-unknown")).toBe(false);
  });
});

describe("navItemForPath", () => {
  it("resolves the deepest matching nav item for a nested path", () => {
    expect(navItemForPath("/treasury/reconciliation/export")?.href).toBe(
      "/treasury/reconciliation",
    );
    expect(navItemForPath("/staff")?.href).toBe("/staff");
    expect(navItemForPath("/nope")).toBeUndefined();
  });
});

describe("floatStatusDot (AC3 — green/red dot from P1-E06)", () => {
  it("is green when float is healthy", () => {
    const dot = floatStatusDot("ok");
    expect(dot.color).toBe("green");
    expect(dot.healthy).toBe(true);
  });

  it("is red when float is low", () => {
    const dot = floatStatusDot("low");
    expect(dot.color).toBe("red");
    expect(dot.healthy).toBe(false);
  });

  it("is red and labelled unknown when the float surface is unavailable", () => {
    const dot = floatStatusDot("unknown");
    expect(dot.color).toBe("red");
    expect(dot.healthy).toBe(false);
  });
});

describe("headerViewModel (AC3 — user, role badge, float dot, logout)", () => {
  const float: FloatStatus = "ok";
  it("exposes user name, role badge label, float dot, and a logout target", () => {
    const vm = headerViewModel({ id: "u1", name: "Jane Mwangi", role: "admin" }, float);
    expect(vm.userName).toBe("Jane Mwangi");
    expect(vm.roleBadge).toBe("Admin Console");
    expect(vm.floatDot.color).toBe("green");
    expect(vm.logoutHref).toBe("/logout");
  });

  it("badges treasury + accountant under the Admin Console group", () => {
    expect(headerViewModel({ id: "u2", name: "T", role: "treasury" }, "low").roleBadge).toBe(
      "Admin Console",
    );
    expect(headerViewModel({ id: "u3", name: "A", role: "accountant" }, "ok").roleBadge).toBe(
      "Admin Console",
    );
  });

  it("falls back to the raw id when no name is supplied", () => {
    const vm = headerViewModel({ id: "u9", name: "", role: "super_admin" }, "ok");
    expect(vm.userName).toBe("u9");
  });
});
