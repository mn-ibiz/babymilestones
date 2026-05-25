import { describe, expect, it } from "vitest";
import type { RecordVisitResponse } from "@bm/contracts";
import {
  VISIT_STEPS,
  RATE_MAX_KES,
  canConfirmVisit,
  currentVisitStep,
  isVisitWarning,
  kesToCents,
  validateVisit,
  visitOutcomeLabel,
  type VisitFormValues,
} from "./record-visit-form.js";

/**
 * P1-E05-S04 — reception record-a-service-visit flow logic. Three-step picker
 * (service → child → staff → confirm, AC1), client-side validation mirroring the
 * contract, and the insufficient-funds warning surfacing (AC4).
 */
const valid: VisitFormValues = {
  serviceId: "svc-1",
  childId: "child-1",
  staffId: "staff-1",
  staffName: "Jane K",
  rateKes: 200,
};

describe("VISIT_STEPS (AC1)", () => {
  it("orders service → child → staff → confirm", () => {
    expect(VISIT_STEPS).toEqual(["service", "child", "staff", "confirm"]);
  });
});

describe("currentVisitStep (AC1)", () => {
  it("advances as each pick is made", () => {
    expect(currentVisitStep({ ...valid, serviceId: "" })).toBe("service");
    expect(currentVisitStep({ ...valid, childId: "" })).toBe("child");
    expect(currentVisitStep({ ...valid, staffId: "" })).toBe("staff");
    expect(currentVisitStep(valid)).toBe("confirm");
  });
});

describe("validateVisit", () => {
  it("accepts a complete valid visit", () => {
    const r = validateVisit(valid);
    expect(r.ok).toBe(true);
    expect(canConfirmVisit(r)).toBe(true);
  });
  it("flags every missing pick", () => {
    const r = validateVisit({ serviceId: "", childId: "", staffId: "", staffName: "", rateKes: 200 });
    expect(r.ok).toBe(false);
    expect(r.errors.serviceId).toBeTruthy();
    expect(r.errors.childId).toBeTruthy();
    expect(r.errors.staffId).toBeTruthy();
    expect(r.errors.staffName).toBeTruthy();
  });
  it("rejects a negative / non-integer / over-max rate", () => {
    expect(validateVisit({ ...valid, rateKes: -1 }).ok).toBe(false);
    expect(validateVisit({ ...valid, rateKes: 10.5 }).ok).toBe(false);
    expect(validateVisit({ ...valid, rateKes: RATE_MAX_KES + 1 }).ok).toBe(false);
  });
  it("allows a zero rate (free/promo)", () => {
    expect(validateVisit({ ...valid, rateKes: 0 }).ok).toBe(true);
  });
});

describe("kesToCents", () => {
  it("converts whole KES to integer cents", () => {
    expect(kesToCents(200)).toBe(200_00);
    expect(kesToCents(0)).toBe(0);
  });
});

describe("visitOutcomeLabel / isVisitWarning (AC4)", () => {
  const base: RecordVisitResponse = {
    bookingId: "b",
    invoiceId: "i",
    outcome: "settled",
    debitedCents: 200_00,
    warning: false,
    warningMessage: null,
  };
  it("labels each outcome", () => {
    expect(visitOutcomeLabel("settled")).toMatch(/paid from wallet/i);
    expect(visitOutcomeLabel("settled_on_credit")).toMatch(/auto-credit/i);
    expect(visitOutcomeLabel("outstanding")).toMatch(/outstanding/i);
  });
  it("warns only on the outstanding path", () => {
    expect(isVisitWarning(base)).toBe(false);
    expect(
      isVisitWarning({ ...base, outcome: "outstanding", warning: true, warningMessage: "x" }),
    ).toBe(true);
  });
});
