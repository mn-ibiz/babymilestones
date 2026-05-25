import { describe, expect, it } from "vitest";
import { SYSTEM_STAFF_ROLES } from "@bm/contracts";
import {
  STAFF_ROLES,
  isStaffRole,
  landingForRole,
  type Role,
} from "./staff.js";

describe("staff roles (P1-E01-S03)", () => {
  it("recognises every staff role and rejects parent", () => {
    for (const role of STAFF_ROLES) {
      expect(isStaffRole(role)).toBe(true);
    }
    expect(isStaffRole("parent")).toBe(false);
    expect(isStaffRole("unknown")).toBe(false);
  });

  it("routes admin-family roles to /admin", () => {
    for (const role of ["admin", "super_admin", "treasury", "accountant"] satisfies Role[]) {
      expect(landingForRole(role)).toBe("/admin");
    }
  });

  it("routes operator roles to their own surfaces", () => {
    expect(landingForRole("reception")).toBe("/reception");
    expect(landingForRole("cashier")).toBe("/cashier");
    expect(landingForRole("packer")).toBe("/packer");
  });

  it("routes parent to the parent dashboard", () => {
    expect(landingForRole("parent")).toBe("/dashboard");
  });

  // P1-E10-S02: the staff login-user admin surface mirrors the auth taxonomy in
  // @bm/contracts (which cannot import @bm/auth — native binding). Pin them in
  // lockstep here so the two never drift apart silently.
  it("keeps contracts SYSTEM_STAFF_ROLES in lockstep with auth STAFF_ROLES", () => {
    expect([...SYSTEM_STAFF_ROLES].sort()).toEqual([...STAFF_ROLES].sort());
  });
});
