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
  SERVICE_NAME_MAX,
  ATTRIBUTION_ROLES,
  isAttributionRole,
  TAX_TREATMENTS,
  DEFAULT_TAX_TREATMENT,
  isTaxTreatment,
  COACHING_FORMATS,
  isCoachingFormat,
  salonHourBucket,
  groupSalonBookingsByStylistAndHour,
  salonCompleteSchema,
  salonWalkInSchema,
  formatSalonRevenue,
  salonReportTileViewModel,
  salonReportDrillRows,
  operationsDashboardTiles,
  operationsTopStaffRows,
  feedbackDashboardQuerySchema,
  feedbackUnitRows,
  feedbackStaffRows,
  feedbackResponseRows,
  feedbackDistributionBars,
  adminAlertRows,
  type FeedbackDashboardDto,
  type FeedbackResponseDto,
  type AdminAlertDto,
  staffLeaderboardQuerySchema,
  staffLeaderboardRows,
  staffCommissionDrilldownView,
  staffLeaderboardRoleOptions,
  attributionRoleLabel,
  SERVICE_UNITS,
  type ReconciliationExportRow,
  type ParentProfile,
  type SalonCounterBooking,
  type SalonDayReportDto,
  type OperationsDashboardDto,
  type StaffLeaderboardDto,
  type StaffCommissionDrilldownDto,
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

  it("neutralises spreadsheet formula injection in a user-controlled account name (review fix)", () => {
    const csv = reconciliationRowsToCsv([
      {
        date: "2026-05-01",
        floatAccountId: "a1",
        account: "=cmd|'/c calc'!A1",
        systemCents: -500,
        realCents: -500,
        driftCents: 0,
        adjustmentsCents: 0,
      },
    ]);
    // Formula-trigger account name is prefixed with a single quote so Excel/Sheets
    // treats it as literal text, not a formula.
    expect(csv).toContain(",'=cmd");
    // Signed money columns are NOT corrupted by the guard.
    expect(csv).toContain("-5.00");
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
    acquisitionSource: null,
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
  it("reaches the monthiversary on the last day of a shorter month (day 29-31 births)", () => {
    // Born Jan 31 is 1 month old on Feb 28 (Feb has no 31st), not 0.
    expect(ageInMonths("2023-01-31", new Date("2023-02-28T00:00:00Z"))).toBe(1);
    expect(ageInMonths("2023-03-31", new Date("2023-04-30T00:00:00Z"))).toBe(1);
    // The day before the (clamped) monthiversary still counts as not-yet-reached.
    expect(ageInMonths("2023-01-30", new Date("2023-02-28T00:00:00Z"))).toBe(1);
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

describe("coaching catalogue contracts (P5-E01-S01)", () => {
  it("coaching is a first-class service unit (AC1)", () => {
    expect(SERVICE_UNITS).toContain("coaching");
    expect(serviceCreateSchema.parse({ name: "Sleep coaching", unit: "coaching" }).unit).toBe(
      "coaching",
    );
  });

  it("exposes the constrained coaching-format set + guard (AC2)", () => {
    expect(COACHING_FORMATS).toEqual(["one_to_one", "group"]);
    expect(isCoachingFormat("one_to_one")).toBe(true);
    expect(isCoachingFormat("group")).toBe(true);
    expect(isCoachingFormat("webinar")).toBe(false);
    expect(isCoachingFormat(null)).toBe(false);
  });

  it("serviceCreateSchema accepts format, duration + age-stage tags (AC2)", () => {
    const parsed = serviceCreateSchema.parse({
      name: "Sleep coaching",
      unit: "coaching",
      format: "one_to_one",
      coachingDurationMinutes: 45,
      ageStageTags: ["expecting", "0-3mo"],
      attributionRoleRequired: "coach",
    });
    expect(parsed.format).toBe("one_to_one");
    expect(parsed.coachingDurationMinutes).toBe(45);
    expect(parsed.ageStageTags).toEqual(["expecting", "0-3mo"]);
    expect(parsed.attributionRoleRequired).toBe("coach");
  });

  it("serviceCreateSchema collapses absent format/tags to null + trims/dedupes tags (AC2)", () => {
    const bare = serviceCreateSchema.parse({ name: "Group coaching", unit: "coaching" });
    expect(bare.format).toBeNull();
    // Duration follows the existing optional-number convention (undefined → DB null).
    expect(bare.coachingDurationMinutes).toBeUndefined();
    expect(bare.ageStageTags).toBeNull();
    // An explicit empty set is preserved as [] (distinct from null).
    expect(serviceCreateSchema.parse({ name: "C", unit: "coaching", ageStageTags: [] }).ageStageTags).toEqual([]);
    // Tags are trimmed, blanks dropped, duplicates removed.
    expect(
      serviceCreateSchema.parse({
        name: "C",
        unit: "coaching",
        ageStageTags: [" 0-3mo ", "", "0-3mo", "3-6mo"],
      }).ageStageTags,
    ).toEqual(["0-3mo", "3-6mo"]);
  });

  it("serviceCreateSchema rejects a bad format + non-positive duration (AC2)", () => {
    expect(
      serviceCreateSchema.safeParse({ name: "C", unit: "coaching", format: "webinar" }).success,
    ).toBe(false);
    expect(
      serviceCreateSchema.safeParse({ name: "C", unit: "coaching", coachingDurationMinutes: 0 })
        .success,
    ).toBe(false);
    expect(
      serviceCreateSchema.safeParse({ name: "C", unit: "coaching", coachingDurationMinutes: 1.5 })
        .success,
    ).toBe(false);
  });

  it("serviceUpdateSchema validates + only changes coaching fields when present (AC2)", () => {
    expect(serviceUpdateSchema.parse({ format: "group" }).format).toBe("group");
    expect(serviceUpdateSchema.parse({ coachingDurationMinutes: 60 }).coachingDurationMinutes).toBe(60);
    expect(serviceUpdateSchema.parse({ ageStageTags: ["6-12mo"] }).ageStageTags).toEqual(["6-12mo"]);
    // Untouched on a name-only patch.
    expect(serviceUpdateSchema.safeParse({ name: "C" }).data?.format).toBeUndefined();
    // Invalid values rejected.
    expect(serviceUpdateSchema.safeParse({ format: "webinar" }).success).toBe(false);
    expect(serviceUpdateSchema.safeParse({ coachingDurationMinutes: -5 }).success).toBe(false);
  });
});

describe("discreet billing labels (P5-E01-S05)", () => {
  it("serviceCreateSchema defaults discreet billing OFF with a null label (AC1/AC3)", () => {
    const bare = serviceCreateSchema.parse({ name: "Sleep coaching", unit: "coaching" });
    expect(bare.discreetBillingEnabled).toBe(false);
    expect(bare.discreetBillingLabel).toBeNull();
  });

  it("serviceCreateSchema accepts an enabled toggle with a trimmed label (AC1/AC3)", () => {
    const parsed = serviceCreateSchema.parse({
      name: "Postnatal depression coaching",
      unit: "coaching",
      discreetBillingEnabled: true,
      discreetBillingLabel: "  BM Coaching Session  ",
    });
    expect(parsed.discreetBillingEnabled).toBe(true);
    expect(parsed.discreetBillingLabel).toBe("BM Coaching Session");
  });

  it("serviceCreateSchema requires a non-empty label when enabled (AC1/AC3)", () => {
    expect(
      serviceCreateSchema.safeParse({ name: "C", unit: "coaching", discreetBillingEnabled: true })
        .success,
    ).toBe(false);
    expect(
      serviceCreateSchema.safeParse({
        name: "C",
        unit: "coaching",
        discreetBillingEnabled: true,
        discreetBillingLabel: "   ",
      }).success,
    ).toBe(false);
  });

  it("serviceCreateSchema rejects an over-long label", () => {
    expect(
      serviceCreateSchema.safeParse({
        name: "C",
        unit: "coaching",
        discreetBillingEnabled: true,
        discreetBillingLabel: "x".repeat(SERVICE_NAME_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("serviceCreateSchema collapses a label to null when the toggle is off", () => {
    // A label supplied without the toggle is ignored (collapses to null) — the
    // receipt only substitutes when enabled.
    const parsed = serviceCreateSchema.parse({
      name: "C",
      unit: "coaching",
      discreetBillingLabel: "BM Coaching Session",
    });
    expect(parsed.discreetBillingEnabled).toBe(false);
    expect(parsed.discreetBillingLabel).toBeNull();
  });

  it("serviceUpdateSchema only changes discreet fields when present + validates them (AC3)", () => {
    expect(
      serviceUpdateSchema.parse({
        discreetBillingEnabled: true,
        discreetBillingLabel: "BM Coaching Session",
      }).discreetBillingLabel,
    ).toBe("BM Coaching Session");
    // Untouched on a name-only patch: both stay undefined (absent = untouched),
    // so a name-only edit never clears a stored label.
    expect(serviceUpdateSchema.safeParse({ name: "C" }).data?.discreetBillingEnabled).toBeUndefined();
    expect(serviceUpdateSchema.safeParse({ name: "C" }).data?.discreetBillingLabel).toBeUndefined();
    // Enabling without a label is rejected.
    expect(serviceUpdateSchema.safeParse({ discreetBillingEnabled: true }).success).toBe(false);
    // Disabling can clear the label to null.
    const off = serviceUpdateSchema.parse({ discreetBillingEnabled: false, discreetBillingLabel: null });
    expect(off.discreetBillingEnabled).toBe(false);
    expect(off.discreetBillingLabel).toBeNull();
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

describe("salon counter board grouping (P3-E03-S03 / Story 25.3 AC1)", () => {
  function booking(over: Partial<SalonCounterBooking>): SalonCounterBooking {
    return {
      bookingId: "b",
      salonSlotId: "s",
      staffId: "stylist-1",
      staffName: "Asha",
      childId: "c",
      childName: "Zola",
      photoConsent: false,
      serviceId: "svc",
      serviceName: "Kids Cut",
      slotDate: "2026-06-15",
      startTime: "09:00",
      endTime: "10:00",
      paidVia: "wallet",
      checkedInAt: null,
      completedAt: null,
      photoRef: null,
      ...over,
    };
  }

  it("buckets a start time to its HH:00 hour", () => {
    expect(salonHourBucket("09:30")).toBe("09:00");
    expect(salonHourBucket("14:05")).toBe("14:00");
  });

  it("groups by stylist then by hour, preserving stylist order (AC1)", () => {
    const board = groupSalonBookingsByStylistAndHour(
      [
        booking({ bookingId: "a1", staffId: "asha", staffName: "Asha", startTime: "09:00" }),
        booking({ bookingId: "a2", staffId: "asha", staffName: "Asha", startTime: "09:30" }),
        booking({ bookingId: "a3", staffId: "asha", staffName: "Asha", startTime: "11:00" }),
        booking({ bookingId: "b1", staffId: "bree", staffName: "Bree", startTime: "10:00" }),
      ],
      "2026-06-15",
    );
    expect(board.date).toBe("2026-06-15");
    expect(board.stylists.map((s) => s.staffName)).toEqual(["Asha", "Bree"]);

    const asha = board.stylists[0]!;
    expect(asha.hours.map((h) => h.hour)).toEqual(["09:00", "11:00"]);
    expect(asha.hours[0]!.bookings.map((b) => b.bookingId)).toEqual(["a1", "a2"]);
    expect(asha.hours[1]!.bookings.map((b) => b.bookingId)).toEqual(["a3"]);

    expect(board.stylists[1]!.hours[0]!.hour).toBe("10:00");
  });

  it("returns an empty board for no bookings", () => {
    expect(groupSalonBookingsByStylistAndHour([], "2026-06-15")).toEqual({
      date: "2026-06-15",
      stylists: [],
    });
  });

  it("salonCompleteSchema accepts an optional photoRef and rejects an empty one", () => {
    expect(salonCompleteSchema.safeParse({ bookingId: "00000000-0000-0000-0000-000000000000" }).success).toBe(true);
    expect(
      salonCompleteSchema.safeParse({ bookingId: "00000000-0000-0000-0000-000000000000", photoRef: "k" }).success,
    ).toBe(true);
    expect(
      salonCompleteSchema.safeParse({ bookingId: "00000000-0000-0000-0000-000000000000", photoRef: "" }).success,
    ).toBe(false);
  });

  it("salonWalkInSchema requires parent + child + salon visit fields (AC4)", () => {
    const ok = salonWalkInSchema.safeParse({
      firstName: "Pat",
      lastName: "Doe",
      phone: "0712345678",
      childFirstName: "Kid",
      childDateOfBirth: "2022-01-01",
      serviceId: "00000000-0000-0000-0000-000000000001",
      staffId: "00000000-0000-0000-0000-000000000002",
    });
    expect(ok.success).toBe(true);
    // Missing service/staff is rejected.
    expect(
      salonWalkInSchema.safeParse({ firstName: "Pat", lastName: "Doe", phone: "0712345678", childFirstName: "Kid", childDateOfBirth: "2022-01-01" }).success,
    ).toBe(false);
    // Bad DOB shape rejected.
    expect(
      salonWalkInSchema.safeParse({
        firstName: "Pat",
        lastName: "Doe",
        phone: "0712345678",
        childFirstName: "Kid",
        childDateOfBirth: "01/01/2022",
        serviceId: "00000000-0000-0000-0000-000000000001",
        staffId: "00000000-0000-0000-0000-000000000002",
      }).success,
    ).toBe(false);
  });
});

describe("salon reporting tile + drill-down view-models (P3-E03-S05 / Story 25.5)", () => {
  const report: SalonDayReportDto = {
    date: "2026-06-15",
    bookings: 3,
    noShows: 1,
    revenueCents: 7500,
    stylists: [
      { staffId: "asha", staffName: "Asha", bookings: 2, noShows: 1, revenueCents: 5000 },
      { staffId: "bree", staffName: "Bree", bookings: 1, noShows: 0, revenueCents: 2500 },
    ],
  };

  it("formats revenue cents as a KES amount", () => {
    expect(formatSalonRevenue(7500)).toBe("KES 75.00");
    expect(formatSalonRevenue(0)).toBe("KES 0.00");
    expect(formatSalonRevenue(123456)).toBe("KES 1,234.56");
  });

  it("shapes the headline tile: bookings / no-shows / revenue (AC1)", () => {
    const vm = salonReportTileViewModel(report);
    expect(vm.date).toBe("2026-06-15");
    expect(vm.isEmpty).toBe(false);
    expect(vm.stats).toEqual([
      { label: "Bookings", value: "3" },
      { label: "No-shows", value: "1" },
      { label: "Revenue", value: "KES 75.00" },
    ]);
  });

  it("flags an empty day so the tile can render an empty state (AC1)", () => {
    const vm = salonReportTileViewModel({ date: "2026-06-15", bookings: 0, noShows: 0, revenueCents: 0, stylists: [] });
    expect(vm.isEmpty).toBe(true);
    expect(vm.stats.map((s) => s.value)).toEqual(["0", "0", "KES 0.00"]);
  });

  it("shapes the per-stylist drill-down rows in server order (AC2)", () => {
    const rows = salonReportDrillRows(report);
    expect(rows).toEqual([
      { staffId: "asha", staffName: "Asha", bookings: "2", noShows: "1", revenue: "KES 50.00" },
      { staffId: "bree", staffName: "Bree", bookings: "1", noShows: "0", revenue: "KES 25.00" },
    ]);
  });

  it("an empty day has no drill-down rows (AC2)", () => {
    expect(salonReportDrillRows({ date: "2026-06-15", bookings: 0, noShows: 0, revenueCents: 0, stylists: [] })).toEqual([]);
  });
});

describe("operations dashboard tiles view-model (P3-E05-S01 / Story 27.1)", () => {
  const dto: OperationsDashboardDto = {
    date: "2026-06-15",
    revenue: {
      totalCents: 12_500,
      byUnit: [
        { unit: "play", revenueCents: 5000 },
        { unit: "talent", revenueCents: 0 },
        { unit: "salon", revenueCents: 7500 },
        { unit: "coaching", revenueCents: 0 },
        { unit: "event", revenueCents: 0 },
      ],
    },
    bookingsCount: 4,
    activeSessions: 2,
    outstandingCents: 30_000,
    topStaff: [
      { staffId: "s1", staffName: "Asha", bookings: 2, revenueCents: 7500 },
      { staffId: "s2", staffName: "Bree", bookings: 1, revenueCents: 5000 },
    ],
  };

  it("shapes the five headline tiles, each with a drill-down href (AC1/AC2)", () => {
    const vm = operationsDashboardTiles(dto);
    expect(vm.date).toBe("2026-06-15");
    const byKey = Object.fromEntries(vm.tiles.map((t) => [t.key, t]));

    expect(byKey.revenue).toMatchObject({ label: "Today's revenue", value: "KES 125.00" });
    expect(byKey.bookings).toMatchObject({ label: "Bookings today", value: "4" });
    expect(byKey.activeSessions).toMatchObject({ label: "Active sessions", value: "2" });
    expect(byKey.outstanding).toMatchObject({ label: "Outstanding balances", value: "KES 300.00" });
    expect(byKey.topStaff).toMatchObject({ label: "Top staff today", value: "Asha" });

    // AC2: every tile clicks through to a drill-down route.
    for (const tile of vm.tiles) {
      expect(tile.href.startsWith("/")).toBe(true);
    }
  });

  it("breaks the revenue tile down per unit, each linking to a drill-down (AC1/AC2)", () => {
    const vm = operationsDashboardTiles(dto);
    expect(vm.revenueByUnit).toEqual([
      { unit: "play", label: "Play", value: "KES 50.00", href: "/operations/revenue?unit=play" },
      { unit: "talent", label: "Talent", value: "KES 0.00", href: "/operations/revenue?unit=talent" },
      { unit: "salon", label: "Salon", value: "KES 75.00", href: "/salon-report" },
      { unit: "coaching", label: "Coaching", value: "KES 0.00", href: "/operations/revenue?unit=coaching" },
      { unit: "event", label: "Event", value: "KES 0.00", href: "/operations/revenue?unit=event" },
    ]);
  });

  it("shapes the top-staff drill-down rows in server order (AC1/AC2)", () => {
    const rows = operationsTopStaffRows(dto);
    expect(rows).toEqual([
      { staffId: "s1", staffName: "Asha", bookings: "2", revenue: "KES 75.00", href: "/staff-earnings" },
      { staffId: "s2", staffName: "Bree", bookings: "1", revenue: "KES 50.00", href: "/staff-earnings" },
    ]);
  });

  it("an empty day renders zeroed tiles + an em-dash top-staff value (AC1)", () => {
    const empty: OperationsDashboardDto = {
      date: "2026-06-15",
      revenue: { totalCents: 0, byUnit: SERVICE_UNITS.map((unit) => ({ unit, revenueCents: 0 })) },
      bookingsCount: 0,
      activeSessions: 0,
      outstandingCents: 0,
      topStaff: [],
    };
    const vm = operationsDashboardTiles(empty);
    const byKey = Object.fromEntries(vm.tiles.map((t) => [t.key, t]));
    expect(byKey.revenue!.value).toBe("KES 0.00");
    expect(byKey.bookings!.value).toBe("0");
    expect(byKey.topStaff!.value).toBe("—");
    expect(operationsTopStaffRows(empty)).toEqual([]);
  });
});

describe("feedback dashboard contracts (P6-E04-S02 / Story 34.2)", () => {
  const dashboard: FeedbackDashboardDto = {
    from: "2026-06-01",
    to: "2026-06-30",
    totalResponses: 6,
    units: [
      { unit: "salon", count: 4, average: 4.5, distribution: [0, 0, 0, 0, 2, 2] },
      { unit: "play", count: 2, average: 3, distribution: [0, 0, 0, 2, 0, 0] },
    ],
    staff: [
      { staffId: "s1", staffName: "Asha", count: 5, average: 4.2, enoughSamples: true },
      { staffId: "s2", staffName: "Bree", count: 2, average: null, enoughSamples: false },
    ],
  };

  it("validates an inclusive date range; rejects fromDate after toDate (AC2)", () => {
    expect(feedbackDashboardQuerySchema.safeParse({ fromDate: "2026-06-01", toDate: "2026-06-30" }).success).toBe(true);
    expect(feedbackDashboardQuerySchema.safeParse({ fromDate: "2026-06-30", toDate: "2026-06-01" }).success).toBe(false);
    expect(feedbackDashboardQuerySchema.safeParse({ fromDate: "nope", toDate: "2026-06-30" }).success).toBe(false);
  });

  it("shapes per-unit rows: formatted average + a distribution bar (AC1)", () => {
    const rows = feedbackUnitRows(dashboard);
    const salon = rows.find((r) => r.unit === "salon")!;
    expect(salon.label).toBe("Salon");
    expect(salon.count).toBe(4);
    expect(salon.average).toBe("4.5");
    // The distribution renders a 0..5 bar, summing to the unit count.
    const bars = feedbackDistributionBars(salon.distribution);
    expect(bars.reduce((a, b) => a + b.count, 0)).toBe(4);
    expect(bars).toHaveLength(6);
  });

  it("shapes per-staff rows: surfaces a low-sample badge instead of the average (AC1 guardrail)", () => {
    const rows = feedbackStaffRows(dashboard);
    const asha = rows.find((r) => r.staffId === "s1")!;
    expect(asha.average).toBe("4.2");
    expect(asha.lowSample).toBe(false);
    const bree = rows.find((r) => r.staffId === "s2")!;
    // Below threshold → no average surfaced, low-sample badge instead.
    expect(bree.average).toBe("—");
    expect(bree.lowSample).toBe(true);
    expect(bree.sampleBadge).toMatch(/\b2\b/);
  });

  it("shapes anonymised individual responses WITHOUT parent identity (AC3)", () => {
    const responses: FeedbackResponseDto[] = [
      { id: "f1", unit: "salon", staffId: "s1", staffName: "Asha", rating: 5, comment: "Lovely", submittedAt: "2026-06-12T10:00:00.000Z" },
    ];
    const rows = feedbackResponseRows(responses);
    expect(rows[0]).toMatchObject({ id: "f1", unitLabel: "Salon", staffName: "Asha", rating: 5, comment: "Lovely" });
    // No parent identity leaks into the view-model unless the DTO carries it.
    expect(rows[0]!.parentName).toBeUndefined();
    expect(JSON.stringify(rows[0])).not.toContain("parentName");
  });

  it("surfaces parent identity only when the de-anonymised DTO carries it (AC3)", () => {
    const responses: FeedbackResponseDto[] = [
      { id: "f1", unit: "salon", staffId: "s1", staffName: "Asha", rating: 5, comment: null, submittedAt: "2026-06-12T10:00:00.000Z", parentId: "p1", parentName: "Pat Doe" },
    ];
    const rows = feedbackResponseRows(responses);
    expect(rows[0]!.parentName).toBe("Pat Doe");
  });
});

describe("admin in-app alerts contracts (P6-E04-S03 / Story 34.3)", () => {
  const alert: AdminAlertDto = {
    id: "a1",
    type: "negative_feedback",
    severity: "warning",
    sourceType: "feedback",
    sourceId: "f1",
    title: "Low rating (1/5) for Salon",
    body: "A 1/5 rating was submitted.",
    linkPath: "/feedback?focus=f1",
    createdAt: "2026-06-12T10:05:00.000Z",
  };

  it("shapes an alert into a render-ready row carrying its detail link (AC2)", () => {
    const rows = adminAlertRows([alert]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "a1",
      title: "Low rating (1/5) for Salon",
      href: "/feedback?focus=f1",
      severity: "warning",
    });
    // The row carries a formatted date for the list.
    expect(rows[0]!.date).toBe("2026-06-12");
  });

  it("orders alerts newest-first for the bell list", () => {
    const older: AdminAlertDto = { ...alert, id: "a0", createdAt: "2026-06-10T08:00:00.000Z" };
    const rows = adminAlertRows([older, alert]);
    expect(rows.map((r) => r.id)).toEqual(["a1", "a0"]);
  });
});

describe("top-staff leaderboard contracts (P3-E05-S03 / Story 27.3)", () => {
  const dto: StaffLeaderboardDto = {
    from: "2026-06-01",
    to: "2026-06-07",
    rows: [
      { staffId: "s1", staffName: "Asha", role: "stylist", revenueCents: 12_000, serviceCount: 4, avgTicketCents: 3000 },
      { staffId: "s2", staffName: "Bree", role: "stylist", revenueCents: 0, serviceCount: 0, avgTicketCents: 0 },
    ],
  };

  it("validates the range; role is optional but must be an attribution role (AC1/AC2)", () => {
    expect(staffLeaderboardQuerySchema.safeParse({ fromDate: "2026-06-01", toDate: "2026-06-07" }).success).toBe(true);
    const withRole = staffLeaderboardQuerySchema.safeParse({ fromDate: "2026-06-01", toDate: "2026-06-07", role: "stylist" });
    expect(withRole.success).toBe(true);
    // Bad range — fromDate after toDate.
    expect(staffLeaderboardQuerySchema.safeParse({ fromDate: "2026-06-08", toDate: "2026-06-01" }).success).toBe(false);
    // Unknown role.
    expect(staffLeaderboardQuerySchema.safeParse({ fromDate: "2026-06-01", toDate: "2026-06-07", role: "ceo" }).success).toBe(false);
  });

  it("treats an empty role string as no filter (AC2)", () => {
    const parsed = staffLeaderboardQuerySchema.safeParse({ fromDate: "2026-06-01", toDate: "2026-06-07", role: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.role).toBeUndefined();
  });

  it("shapes the leaderboard rows: formatted revenue / count / avg ticket + a drill-down href (AC1/AC3)", () => {
    const rows = staffLeaderboardRows(dto);
    expect(rows[0]).toMatchObject({
      staffId: "s1",
      staffName: "Asha",
      roleLabel: "Stylist",
      revenue: "KES 120.00",
      serviceCount: "4",
      avgTicket: "KES 30.00",
    });
    // AC3: each row clicks through to the per-staff commission drill-down.
    expect(rows[0]!.href).toContain("/operations/leaderboard/s1");
    expect(rows[0]!.href).toContain("fromDate=2026-06-01");
    expect(rows[0]!.href).toContain("toDate=2026-06-07");
    // Zero-service staff: avg ticket reads zero, not NaN.
    expect(rows[1]).toMatchObject({ staffName: "Bree", serviceCount: "0", avgTicket: "KES 0.00" });
  });

  it("offers a role filter control including an 'all roles' option (AC2)", () => {
    const opts = staffLeaderboardRoleOptions();
    expect(opts[0]).toEqual({ value: "", label: "All roles" });
    expect(opts.map((o) => o.value)).toContain("stylist");
    expect(opts.map((o) => o.value)).toContain("instructor");
    expect(opts.map((o) => o.value)).toContain("attendant");
    expect(attributionRoleLabel("event_staff")).toBe("Event staff");
  });

  it("shapes the per-staff commission drill-down totals (AC3)", () => {
    const drill: StaffCommissionDrilldownDto = {
      staffId: "s1",
      staffName: "Asha",
      role: "stylist",
      from: "2026-06-01",
      to: "2026-06-07",
      totals: { netCents: 1800, accruedCents: 2300, reversedCents: 500, entryCount: 3 },
    };
    const view = staffCommissionDrilldownView(drill);
    expect(view.staffName).toBe("Asha");
    expect(view.roleLabel).toBe("Stylist");
    expect(view.netCommission).toBe("KES 18.00");
    expect(view.accruedCommission).toBe("KES 23.00");
    expect(view.reversedCommission).toBe("KES 5.00");
  });
});
