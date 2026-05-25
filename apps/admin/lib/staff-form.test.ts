import { describe, expect, it } from "vitest";
import { STAFF_ROLES } from "@bm/contracts";
import {
  canManageStaff,
  staffRoleLabel,
  staffRoleOptions,
  staffStatusLabel,
  validateStaffForm,
} from "./staff-form.js";

/**
 * P1-E07-S03 — admin staff data-record form/view logic. Only admin/super_admin
 * may manage; the create/edit form validates client-side; role labels + options
 * mirror the attribution-role taxonomy.
 */
describe("staff data-record form logic (P1-E07-S03)", () => {
  it("only admin/super_admin may manage staff", () => {
    expect(canManageStaff("admin")).toBe(true);
    expect(canManageStaff("super_admin")).toBe(true);
    expect(canManageStaff("reception")).toBe(false);
    expect(canManageStaff("cashier")).toBe(false);
  });

  it("offers exactly the constrained role taxonomy", () => {
    expect(staffRoleOptions.map((o) => o.value)).toEqual([...STAFF_ROLES]);
  });

  it("labels each role", () => {
    expect(staffRoleLabel("stylist")).toBe("Stylist");
    expect(staffRoleLabel("event_staff")).toBe("Event staff");
    expect(staffRoleLabel("coach")).toBe("Coach");
  });

  it("flags missing name + invalid role", () => {
    const errors = validateStaffForm({ displayName: "  ", role: "cashier" });
    expect(errors.displayName).toBeDefined();
    expect(errors.role).toBeDefined();
  });

  it("passes a valid form", () => {
    expect(validateStaffForm({ displayName: "Asha", role: "stylist" })).toEqual({});
  });

  it("labels active status", () => {
    expect(staffStatusLabel(true)).toBe("Active");
    expect(staffStatusLabel(false)).toBe("Inactive");
  });
});
