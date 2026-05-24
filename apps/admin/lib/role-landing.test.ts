import { describe, expect, it } from "vitest";
import { surfaceLabel } from "./role-landing.js";

describe("surfaceLabel (P1-E01-S03)", () => {
  it("labels operator surfaces", () => {
    expect(surfaceLabel("reception")).toBe("Reception");
    expect(surfaceLabel("cashier")).toBe("Cashier");
    expect(surfaceLabel("packer")).toBe("Packing");
  });
  it("groups admin-family roles under the Admin Console", () => {
    for (const role of ["admin", "super_admin", "treasury", "accountant"]) {
      expect(surfaceLabel(role)).toBe("Admin Console");
    }
  });
  it("falls back for unknown roles", () => {
    expect(surfaceLabel("parent")).toBe("Unknown");
  });
});
