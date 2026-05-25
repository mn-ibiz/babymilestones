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
  auditLogQuerySchema,
  auditLogEventsToCsv,
  AUDIT_LOG_DEFAULT_LIMIT,
  AUDIT_LOG_EXPORT_COLUMNS,
  recordVisitSchema,
  isVisitOutstanding,
  STAFF_NAME_SNAPSHOT_MAX,
  SERVICE_RATE_MAX_CENTS,
  isOutstanding,
  receiptLineDescription,
  floatAccountCreateSchema,
  floatAccountUpdateSchema,
  floatAccountKindForPaymentMethod,
  reconciliationExportQuerySchema,
  reconciliationExportDayCount,
  reconciliationExportDays,
  reconciliationRowsToCsv,
  centsToKes,
  RECONCILIATION_EXPORT_COLUMNS,
  RECONCILIATION_EXPORT_MAX_DAYS,
  serviceCreateSchema,
  serviceUpdateSchema,
  ATTRIBUTION_ROLES,
  isAttributionRole,
  TAX_TREATMENTS,
  DEFAULT_TAX_TREATMENT,
  isTaxTreatment,
  type ReconciliationExportRow,
  type ParentProfile,
} from "./index.js";

describe("reconciliation export contract (P1-E06-S04)", () => {
  it("accepts a valid inclusive range and rejects from>to (AC1)", () => {
    expect(
      reconciliationExportQuerySchema.safeParse({ fromDate: "2026-05-01", toDate: "2026-05-31" })
        .success,
    ).toBe(true);
    expect(
      reconciliationExportQuerySchema.safeParse({ fromDate: "2026-05-31", toDate: "2026-05-01" })
        .success,
    ).toBe(false);
  });

  it("accepts a single-day range (from == to)", () => {
    expect(
      reconciliationExportQuerySchema.safeParse({ fromDate: "2026-05-10", toDate: "2026-05-10" })
        .success,
    ).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    expect(
      reconciliationExportQuerySchema.safeParse({ fromDate: "01-05-2026", toDate: "2026-05-31" })
        .success,
    ).toBe(false);
    expect(
      reconciliationExportQuerySchema.safeParse({ fromDate: "2026-13-40", toDate: "2026-13-41" })
        .success,
    ).toBe(false);
  });

  it("rejects ranges over the cap", () => {
    expect(
      reconciliationExportQuerySchema.safeParse({ fromDate: "2024-01-01", toDate: "2026-01-01" })
        .success,
    ).toBe(false);
  });

  it("enumerates inclusive days ascending", () => {
    expect(reconciliationExportDayCount("2026-05-01", "2026-05-03")).toBe(3);
    expect(reconciliationExportDays("2026-05-01", "2026-05-03")).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
    ]);
    // Crosses a month boundary correctly.
    expect(reconciliationExportDays("2026-05-31", "2026-06-01")).toEqual(["2026-05-31", "2026-06-01"]);
    expect(RECONCILIATION_EXPORT_MAX_DAYS).toBeGreaterThan(365);
  });

  it("renders cents to exact KES decimal strings (no float drift)", () => {
    expect(centsToKes(0)).toBe("0.00");
    expect(centsToKes(5)).toBe("0.05");
    expect(centsToKes(12345)).toBe("123.45");
    expect(centsToKes(-12345)).toBe("-123.45");
    expect(centsToKes(100)).toBe("1.00");
  });

  it("renders rows as RFC-4180 CSV with the AC2 columns", () => {
    const rows: ReconciliationExportRow[] = [
      {
        date: "2026-05-01",
        floatAccountId: "a1",
        account: "Main Till",
        systemCents: 50_000,
        realCents: 49_000,
        driftCents: 1_000,
        adjustmentsCents: -1_000,
      },
    ];
    const csv = reconciliationRowsToCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(RECONCILIATION_EXPORT_COLUMNS.join(","));
    expect(lines[0]).toBe("date,account,system_balance_kes,real_balance_kes,drift_kes,adjustments_kes");
    expect(lines[1]).toBe("2026-05-01,Main Till,500.00,490.00,10.00,-10.00");
    // trailing CRLF
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("quotes fields containing commas or quotes (RFC-4180)", () => {
    const csv = reconciliationRowsToCsv([
      {
        date: "2026-05-01",
        floatAccountId: "a1",
        account: 'Equity Bank, "Main"',
        systemCents: 0,
        realCents: 0,
        driftCents: 0,
        adjustmentsCents: 0,
      },
    ]);
    expect(csv).toContain('"Equity Bank, ""Main"""');
  });

  it("emits header only for an empty row set", () => {
    const csv = reconciliationRowsToCsv([]);
    expect(csv).toBe("date,account,system_balance_kes,real_balance_kes,drift_kes,adjustments_kes\r\n");
  });
});

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

describe("attribution role per service (P1-E07-S02)", () => {
  it("ATTRIBUTION_ROLES mirrors the staff-role taxonomy (AC1)", () => {
    expect(ATTRIBUTION_ROLES).toEqual([
      "stylist",
      "instructor",
      "attendant",
      "coach",
      "event_staff",
    ]);
  });

  it("isAttributionRole narrows allowed values only (AC1)", () => {
    for (const r of ATTRIBUTION_ROLES) expect(isAttributionRole(r)).toBe(true);
    expect(isAttributionRole("reception")).toBe(false); // RBAC role, not attribution
    expect(isAttributionRole("admin")).toBe(false);
    expect(isAttributionRole(null)).toBe(false);
  });

  it("serviceCreateSchema accepts a valid attribution role (AC1)", () => {
    const parsed = serviceCreateSchema.parse({
      name: "Baby Haircut",
      unit: "salon",
      attributionRoleRequired: "stylist",
    });
    expect(parsed.attributionRoleRequired).toBe("stylist");
  });

  it("serviceCreateSchema collapses absent/empty attribution to null (AC3)", () => {
    expect(serviceCreateSchema.parse({ name: "Hall", unit: "event" }).attributionRoleRequired).toBeNull();
    expect(
      serviceCreateSchema.parse({ name: "Hall", unit: "event", attributionRoleRequired: "  " })
        .attributionRoleRequired,
    ).toBeNull();
  });

  it("serviceCreateSchema rejects a role outside the taxonomy (AC1)", () => {
    const r = serviceCreateSchema.safeParse({
      name: "X",
      unit: "play",
      attributionRoleRequired: "reception",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path[0]).toBe("attributionRoleRequired");
    }
  });

  it("serviceUpdateSchema validates the attribution role too (AC1)", () => {
    expect(
      serviceUpdateSchema.safeParse({ attributionRoleRequired: "coach" }).success,
    ).toBe(true);
    expect(
      serviceUpdateSchema.safeParse({ attributionRoleRequired: "wizard" }).success,
    ).toBe(false);
  });
});

describe("VAT / tax treatment per service (P1-E07-S04)", () => {
  it("exposes the four treatments + vat_exempt default (AC1/AC3)", () => {
    expect(TAX_TREATMENTS).toEqual([
      "vat_inclusive",
      "vat_exclusive",
      "vat_exempt",
      "zero_rated",
    ]);
    expect(DEFAULT_TAX_TREATMENT).toBe("vat_exempt");
    expect(isTaxTreatment("zero_rated")).toBe(true);
    expect(isTaxTreatment("gst")).toBe(false);
  });

  it("serviceCreateSchema defaults taxTreatment to vat_exempt when omitted (AC3)", () => {
    expect(serviceCreateSchema.parse({ name: "Play", unit: "play" }).taxTreatment).toBe("vat_exempt");
    expect(
      serviceCreateSchema.parse({ name: "Play", unit: "play", taxTreatment: "  " }).taxTreatment,
    ).toBe("vat_exempt");
  });

  it("serviceCreateSchema accepts a valid treatment + rejects an invalid one (AC1)", () => {
    expect(
      serviceCreateSchema.parse({ name: "Salon", unit: "salon", taxTreatment: "vat_inclusive" })
        .taxTreatment,
    ).toBe("vat_inclusive");
    expect(
      serviceCreateSchema.safeParse({ name: "X", unit: "play", taxTreatment: "gst" }).success,
    ).toBe(false);
  });

  it("serviceUpdateSchema only changes taxTreatment when present + validates it (AC1)", () => {
    expect(serviceUpdateSchema.parse({ taxTreatment: "zero_rated" }).taxTreatment).toBe("zero_rated");
    expect(serviceUpdateSchema.safeParse({ name: "X" }).data?.taxTreatment).toBeUndefined();
    expect(serviceUpdateSchema.safeParse({ taxTreatment: "gst" }).success).toBe(false);
  });
});

describe("audit log viewer contracts (P1-E10-S03)", () => {
  it("defaults limit/offset and accepts an empty query", () => {
    const parsed = auditLogQuerySchema.parse({});
    expect(parsed.limit).toBe(AUDIT_LOG_DEFAULT_LIMIT);
    expect(parsed.offset).toBe(0);
    expect(parsed.actor).toBeUndefined();
  });

  it("coerces string limit/offset from the query string and clamps the max", () => {
    expect(auditLogQuerySchema.parse({ limit: "25", offset: "10" })).toMatchObject({
      limit: 25,
      offset: 10,
    });
    expect(auditLogQuerySchema.safeParse({ limit: "999" }).success).toBe(false);
    expect(auditLogQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(auditLogQuerySchema.safeParse({ offset: "-1" }).success).toBe(false);
  });

  it("treats blank/array filter values as absent", () => {
    const parsed = auditLogQuerySchema.parse({ action: "  ", targetId: ["wallet-9"] });
    expect(parsed.action).toBeUndefined();
    expect(parsed.targetId).toBe("wallet-9");
  });

  it("requires actor to be a uuid and validates the date window", () => {
    expect(auditLogQuerySchema.safeParse({ actor: "not-a-uuid" }).success).toBe(false);
    expect(
      auditLogQuerySchema.safeParse({ fromDate: "2026-05-10", toDate: "2026-05-01" }).success,
    ).toBe(false);
    expect(
      auditLogQuerySchema.safeParse({ fromDate: "2026-05-01", toDate: "2026-05-10" }).success,
    ).toBe(true);
  });

  it("renders events as RFC-4180 CSV with the header + CRLF endings", () => {
    const csv = auditLogEventsToCsv([
      {
        id: "1",
        actorUserId: "user-1",
        action: "admin.user.create",
        targetTable: "users",
        targetId: "u-9",
        createdAt: "2026-05-25T10:00:00.000Z",
      },
      {
        id: "2",
        actorUserId: null,
        action: "auth.signup",
        targetTable: null,
        targetId: null,
        createdAt: "2026-05-25T09:00:00.000Z",
      },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(AUDIT_LOG_EXPORT_COLUMNS.join(","));
    expect(lines[1]).toBe("2026-05-25T10:00:00.000Z,user-1,admin.user.create,users,u-9");
    expect(lines[2]).toBe("2026-05-25T09:00:00.000Z,,auth.signup,,");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("escapes CSV fields containing commas or quotes", () => {
    const csv = auditLogEventsToCsv([
      {
        id: "1",
        actorUserId: "user-1",
        action: 'weird,"action"',
        targetTable: "t",
        targetId: "x",
        createdAt: "2026-05-25T10:00:00.000Z",
      },
    ]);
    expect(csv).toContain('"weird,""action"""');
  });
});
