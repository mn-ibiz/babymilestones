import { describe, expect, it } from "vitest";
import {
  phoneSchema,
  staffLoginSchema,
  parentProfileSchema,
  isProfileComplete,
  emailLightRegex,
  childSchema,
  ageInMonths,
  CHILD_NOTES_MAX,
  paystackInitSchema,
  kesToMinorUnits,
  PAYSTACK_MIN_KES,
  PAYSTACK_MAX_KES,
  parentSearchQuerySchema,
  isOutstanding,
  type ParentProfile,
} from "./index.js";

describe("paystackInitSchema (P1-E04-S04 AC1, AC4)", () => {
  it("accepts a whole-KES amount within bounds, defaulting saveCard to false", () => {
    const r = paystackInitSchema.safeParse({ amountKes: 500 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.saveCard).toBe(false);
  });
  it("accepts an explicit saveCard opt-in (card-on-file)", () => {
    const r = paystackInitSchema.parse({ amountKes: 500, saveCard: true });
    expect(r.saveCard).toBe(true);
  });
  it("rejects a non-integer or out-of-bounds amount", () => {
    expect(paystackInitSchema.safeParse({ amountKes: 12.5 }).success).toBe(false);
    expect(paystackInitSchema.safeParse({ amountKes: PAYSTACK_MIN_KES - 1 }).success).toBe(false);
    expect(paystackInitSchema.safeParse({ amountKes: PAYSTACK_MAX_KES + 1 }).success).toBe(false);
  });
});

describe("kesToMinorUnits", () => {
  it("converts whole KES to Paystack minor units (cents)", () => {
    expect(kesToMinorUnits(500)).toBe(50_000);
    expect(kesToMinorUnits(1)).toBe(100);
  });
});

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
    smsMarketingOptIn: false,
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

describe("childSchema (P1-E02-S03 AC1)", () => {
  it("accepts a first name + valid DOB with optionals omitted", () => {
    const r = childSchema.safeParse({ firstName: "Zola", dateOfBirth: "2024-01-15" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.lastName).toBeNull();
      expect(r.data.gender).toBeNull();
      expect(r.data.allergiesNotes).toBeNull();
    }
  });
  it("requires a first name", () => {
    expect(childSchema.safeParse({ firstName: "", dateOfBirth: "2024-01-15" }).success).toBe(false);
  });
  it("requires a date of birth", () => {
    expect(childSchema.safeParse({ firstName: "Zola" }).success).toBe(false);
  });
  it("rejects a malformed or impossible DOB", () => {
    expect(childSchema.safeParse({ firstName: "Z", dateOfBirth: "15/01/2024" }).success).toBe(false);
    expect(childSchema.safeParse({ firstName: "Z", dateOfBirth: "2024-02-30" }).success).toBe(false);
  });
  it("rejects a future DOB", () => {
    const future = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10);
    expect(childSchema.safeParse({ firstName: "Z", dateOfBirth: future }).success).toBe(false);
  });
  it("caps notes at 500 chars", () => {
    const ok = childSchema.safeParse({
      firstName: "Z",
      dateOfBirth: "2024-01-15",
      allergiesNotes: "a".repeat(CHILD_NOTES_MAX),
    });
    expect(ok.success).toBe(true);
    const tooLong = childSchema.safeParse({
      firstName: "Z",
      dateOfBirth: "2024-01-15",
      allergiesNotes: "a".repeat(CHILD_NOTES_MAX + 1),
    });
    expect(tooLong.success).toBe(false);
  });
});

describe("ageInMonths (P1-E02-S03 AC2)", () => {
  it("counts completed whole months", () => {
    expect(ageInMonths("2024-01-15", new Date("2024-07-15T00:00:00Z"))).toBe(6);
  });
  it("does not advance until the day-of-month is reached", () => {
    expect(ageInMonths("2024-01-15", new Date("2024-07-14T00:00:00Z"))).toBe(5);
  });
  it("spans year boundaries", () => {
    expect(ageInMonths("2023-12-01", new Date("2025-01-01T00:00:00Z"))).toBe(13);
  });
  it("clamps to 0 for same-day or future DOB", () => {
    expect(ageInMonths("2024-07-15", new Date("2024-07-15T00:00:00Z"))).toBe(0);
    expect(ageInMonths("2025-01-01", new Date("2024-07-15T00:00:00Z"))).toBe(0);
  });
});

describe("parentSearchQuerySchema (P1-E05-S01 AC1)", () => {
  it("trims and accepts a non-empty query", () => {
    const r = parentSearchQuerySchema.parse({ q: "  Asha  " });
    expect(r.q).toBe("Asha");
  });
  it("rejects a blank/whitespace-only query", () => {
    expect(parentSearchQuerySchema.safeParse({ q: "   " }).success).toBe(false);
    expect(parentSearchQuerySchema.safeParse({ q: "" }).success).toBe(false);
  });
});

describe("isOutstanding (P1-E05-S02 AC1 — red when > 0)", () => {
  it("is true only when the parent owes money (> 0)", () => {
    expect(isOutstanding(1)).toBe(true);
    expect(isOutstanding(7_500)).toBe(true);
  });
  it("is false at zero or below (no debt → neutral, not red)", () => {
    expect(isOutstanding(0)).toBe(false);
    expect(isOutstanding(-100)).toBe(false);
  });
});
