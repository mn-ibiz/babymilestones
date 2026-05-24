import { describe, expect, it } from "vitest";
import {
  phoneSchema,
  staffLoginSchema,
  parentProfileSchema,
  isProfileComplete,
  emailLightRegex,
  type ParentProfile,
} from "./index.js";

describe("phoneSchema", () => {
  it("accepts a normalised Kenyan phone", () => {
    expect(phoneSchema.safeParse("+254712345678").success).toBe(true);
  });
  it("rejects an un-normalised phone", () => {
    expect(phoneSchema.safeParse("0712345678").success).toBe(false);
  });
});

describe("staffLoginSchema", () => {
  it("accepts a phone + 4-digit PIN", () => {
    expect(staffLoginSchema.safeParse({ phone: "0712000001", pin: "7421" }).success).toBe(true);
  });
  it("rejects a non-4-digit PIN", () => {
    expect(staffLoginSchema.safeParse({ phone: "0712000001", pin: "12" }).success).toBe(false);
  });
});

describe("parentProfileSchema (P1-E02-S01 AC1, AC2)", () => {
  it("accepts required names with optional fields omitted", () => {
    const r = parentProfileSchema.safeParse({ firstName: "Amina", lastName: "Otieno" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({
        firstName: "Amina",
        lastName: "Otieno",
        email: null,
        residentialArea: null,
      });
    }
  });

  it("trims and collapses blank optional fields to null", () => {
    const r = parentProfileSchema.parse({
      firstName: "  Amina  ",
      lastName: "Otieno",
      email: "  ",
      residentialArea: "   ",
    });
    expect(r).toEqual({ firstName: "Amina", lastName: "Otieno", email: null, residentialArea: null });
  });

  it("rejects missing required first/last name", () => {
    expect(parentProfileSchema.safeParse({ firstName: "", lastName: "Otieno" }).success).toBe(false);
    expect(parentProfileSchema.safeParse({ firstName: "Amina" }).success).toBe(false);
  });

  it("accepts a permissive (RFC 5322 light) email and keeps free-text area", () => {
    const r = parentProfileSchema.parse({
      firstName: "Amina",
      lastName: "Otieno",
      email: "amina.o@example.co.ke",
      residentialArea: "Kileleshwa, near the shops",
    });
    expect(r.email).toBe("amina.o@example.co.ke");
    expect(r.residentialArea).toBe("Kileleshwa, near the shops");
  });

  it("permissive email accepts plus/dotted forms, rejects clearly broken ones", () => {
    expect(emailLightRegex.test("a+b@sub.domain.io")).toBe(true);
    expect(emailLightRegex.test("user@host")).toBe(false); // no dotted TLD
    expect(emailLightRegex.test("no at sign")).toBe(false);
    expect(emailLightRegex.test("two@@x.com")).toBe(false);
    expect(parentProfileSchema.safeParse({ firstName: "A", lastName: "B", email: "bad" }).success).toBe(
      false,
    );
  });
});

describe("isProfileComplete (P1-E02-S01 AC3)", () => {
  const base: ParentProfile = {
    userId: "u1",
    firstName: "Amina",
    lastName: "Otieno",
    email: null,
    residentialArea: null,
  };
  it("is false when no profile exists yet (skip path)", () => {
    expect(isProfileComplete(null)).toBe(false);
    expect(isProfileComplete(undefined)).toBe(false);
  });
  it("is true once both names are present", () => {
    expect(isProfileComplete(base)).toBe(true);
  });
  it("is false when a required name is blank", () => {
    expect(isProfileComplete({ ...base, lastName: "  " })).toBe(false);
  });
});
