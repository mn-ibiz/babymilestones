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
  recordVisitSchema,
  isVisitOutstanding,
  STAFF_NAME_SNAPSHOT_MAX,
  SERVICE_RATE_MAX_CENTS,
  isOutstanding,
  receiptLineDescription,
  floatAccountCreateSchema,
  floatAccountUpdateSchema,
  floatAccountKindForPaymentMethod,
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

describe("recordVisitSchema (P1-E05-S04 AC1–AC3)", () => {
  const valid = {
    parentId: "11111111-1111-1111-1111-111111111111",
    childId: "22222222-2222-2222-2222-222222222222",
    serviceId: "33333333-3333-3333-3333-333333333333",
    staffId: "44444444-4444-4444-4444-444444444444",
    staffName: "Jane K",
    rate: 250_00,
  };
  it("accepts a complete valid visit", () => {
    const r = recordVisitSchema.parse(valid);
    expect(r.rate).toBe(250_00);
    expect(r.staffName).toBe("Jane K");
  });
  it("trims the staff name snapshot", () => {
    expect(recordVisitSchema.parse({ ...valid, staffName: "  Jane K  " }).staffName).toBe("Jane K");
  });
  it("rejects a blank staff name", () => {
    expect(recordVisitSchema.safeParse({ ...valid, staffName: "   " }).success).toBe(false);
  });
  it("rejects a name beyond the max length", () => {
    expect(
      recordVisitSchema.safeParse({ ...valid, staffName: "x".repeat(STAFF_NAME_SNAPSHOT_MAX + 1) })
        .success,
    ).toBe(false);
  });
  it("allows a zero rate (free/promo service) but not negative", () => {
    expect(recordVisitSchema.safeParse({ ...valid, rate: 0 }).success).toBe(true);
    expect(recordVisitSchema.safeParse({ ...valid, rate: -1 }).success).toBe(false);
  });
  it("rejects a non-integer or over-max rate", () => {
    expect(recordVisitSchema.safeParse({ ...valid, rate: 10.5 }).success).toBe(false);
    expect(recordVisitSchema.safeParse({ ...valid, rate: SERVICE_RATE_MAX_CENTS + 1 }).success).toBe(
      false,
    );
  });
  it("rejects non-UUID ids", () => {
    expect(recordVisitSchema.safeParse({ ...valid, childId: "nope" }).success).toBe(false);
    expect(recordVisitSchema.safeParse({ ...valid, staffId: "nope" }).success).toBe(false);
  });
});

describe("isVisitOutstanding (P1-E05-S04 AC4)", () => {
  it("is true only for the outstanding outcome", () => {
    expect(isVisitOutstanding("outstanding")).toBe(true);
    expect(isVisitOutstanding("settled")).toBe(false);
    expect(isVisitOutstanding("settled_on_credit")).toBe(false);
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

describe("receiptLineDescription (P1-E05-S06)", () => {
  it("maps known ledger kinds to human descriptions", () => {
    expect(receiptLineDescription("topup")).toBe("Wallet top-up");
    expect(receiptLineDescription("debit")).toBe("Service charge");
    expect(receiptLineDescription("refund")).toBe("Refund");
    expect(receiptLineDescription("reversal")).toBe("Reversal");
    expect(receiptLineDescription("adjustment")).toBe("Adjustment");
  });
  it("falls back to the raw kind for anything unknown", () => {
    expect(receiptLineDescription("mystery")).toBe("mystery");
  });
});

describe("float accounts (P1-E06-S01)", () => {
  it("accepts a valid create payload and defaults openingBalance to 0", () => {
    const parsed = floatAccountCreateSchema.safeParse({
      name: "M-Pesa Till 1",
      kind: "mpesa_till",
      openingDate: "2026-05-25",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.openingBalance).toBe(0);
  });

  it("rejects an unknown kind", () => {
    const parsed = floatAccountCreateSchema.safeParse({
      name: "Bad",
      kind: "crypto",
      openingDate: "2026-05-25",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-integer or negative opening balance", () => {
    expect(
      floatAccountCreateSchema.safeParse({
        name: "x",
        kind: "bank",
        openingBalance: -1,
        openingDate: "2026-05-25",
      }).success,
    ).toBe(false);
    expect(
      floatAccountCreateSchema.safeParse({
        name: "x",
        kind: "bank",
        openingBalance: 1.5,
        openingDate: "2026-05-25",
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed opening date", () => {
    expect(
      floatAccountCreateSchema.safeParse({ name: "x", kind: "bank", openingDate: "25-05-2026" })
        .success,
    ).toBe(false);
    expect(
      floatAccountCreateSchema.safeParse({ name: "x", kind: "bank", openingDate: "2026-13-40" })
        .success,
    ).toBe(false);
  });

  it("update requires at least one field and forbids kind edits", () => {
    expect(floatAccountUpdateSchema.safeParse({}).success).toBe(false);
    expect(floatAccountUpdateSchema.safeParse({ active: false }).success).toBe(true);
    // kind is not a recognised key — partial patch silently ignores it (strip),
    // so a kind-only patch is treated as empty and rejected.
    expect(floatAccountUpdateSchema.safeParse({ kind: "bank" }).success).toBe(false);
  });

  it("maps payment methods to float account kinds (AC3)", () => {
    expect(floatAccountKindForPaymentMethod("cash")).toBe("cash_drawer");
    expect(floatAccountKindForPaymentMethod("mpesa_stk")).toBe("mpesa_till");
    expect(floatAccountKindForPaymentMethod("mpesa")).toBe("mpesa_till");
    expect(floatAccountKindForPaymentMethod("bank_transfer")).toBe("bank");
    expect(floatAccountKindForPaymentMethod("paystack_card")).toBe("bank");
    expect(floatAccountKindForPaymentMethod("unknown")).toBeNull();
  });
});
