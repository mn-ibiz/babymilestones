import { describe, expect, it } from "vitest";
import {
  canManageUsers,
  systemRoleLabel,
  systemRoleOptions,
  userStatusLabel,
  validateUserForm,
} from "./users-form.js";

describe("staff login-user form logic (P1-E10-S02)", () => {
  it("gates management to admin / super_admin only", () => {
    expect(canManageUsers("admin")).toBe(true);
    expect(canManageUsers("super_admin")).toBe(true);
    expect(canManageUsers("reception")).toBe(false);
    expect(canManageUsers("cashier")).toBe(false);
    expect(canManageUsers("parent")).toBe(false);
  });

  it("offers every system staff role as an option (no parent)", () => {
    const values = systemRoleOptions.map((o) => o.value);
    expect(values).toContain("reception");
    expect(values).toContain("super_admin");
    expect(values).not.toContain("parent" as never);
    for (const o of systemRoleOptions) expect(o.label.length).toBeGreaterThan(0);
  });

  it("labels roles for humans", () => {
    expect(systemRoleLabel("super_admin")).toBe("Super admin");
    expect(systemRoleLabel("reception")).toBe("Reception");
  });

  it("accepts a valid local + intl phone, a known role, and an optional strong PIN", () => {
    expect(validateUserForm({ phone: "0733111222", role: "reception", pin: "" })).toEqual({});
    expect(validateUserForm({ phone: "+254733111222", role: "admin", pin: "8642" })).toEqual({});
  });

  it("rejects a bad phone", () => {
    expect(validateUserForm({ phone: "12345", role: "reception", pin: "" }).phone).toBeDefined();
  });

  it("rejects an unknown role", () => {
    expect(validateUserForm({ phone: "0733111222", role: "wizard", pin: "" }).role).toBeDefined();
    expect(validateUserForm({ phone: "0733111222", role: "parent", pin: "" }).role).toBeDefined();
  });

  it("rejects a non-4-digit or weak PIN, but allows an empty PIN (auto-generate)", () => {
    expect(validateUserForm({ phone: "0733111222", role: "reception", pin: "12" }).pin).toBeDefined();
    expect(validateUserForm({ phone: "0733111222", role: "reception", pin: "1234" }).pin).toBeDefined();
    expect(validateUserForm({ phone: "0733111222", role: "reception", pin: "" }).pin).toBeUndefined();
  });

  it("labels active status", () => {
    expect(userStatusLabel(true)).toBe("Active");
    expect(userStatusLabel(false)).toBe("Deactivated");
  });
});
