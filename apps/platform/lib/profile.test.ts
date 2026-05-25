import { describe, expect, it } from "vitest";
import type { ParentProfile } from "@bm/contracts";
import {
  emptyDraft,
  draftFromProfile,
  validateDraft,
  shouldShowCompletionBanner,
} from "./profile.js";

const complete: ParentProfile = {
  userId: "u1",
  firstName: "Amina",
  lastName: "Otieno",
  email: "amina@example.com",
  residentialArea: "Kileleshwa",
  smsMarketingOptIn: false,
  acquisitionSource: null,
};

describe("validateDraft (P1-E02-S01 AC2)", () => {
  it("requires both names", () => {
    const errors = validateDraft(emptyDraft);
    expect(errors.firstName).toBeDefined();
    expect(errors.lastName).toBeDefined();
  });
  it("accepts names with optionals blank", () => {
    expect(validateDraft({ ...emptyDraft, firstName: "A", lastName: "B" })).toEqual({});
  });
  it("flags an invalid email, allows a permissive one", () => {
    expect(validateDraft({ firstName: "A", lastName: "B", email: "nope", residentialArea: "" }).email).toBeDefined();
    expect(
      validateDraft({ firstName: "A", lastName: "B", email: "a+b@sub.host.io", residentialArea: "" }).email,
    ).toBeUndefined();
  });
});

describe("shouldShowCompletionBanner (P1-E02-S01 AC3)", () => {
  it("shows when no profile (after skip)", () => {
    expect(shouldShowCompletionBanner(null)).toBe(true);
  });
  it("hides once complete", () => {
    expect(shouldShowCompletionBanner(complete)).toBe(false);
  });
});

describe("draftFromProfile (P1-E02-S01 AC4)", () => {
  it("seeds the edit form, mapping null optionals to empty strings", () => {
    expect(draftFromProfile({ ...complete, email: null, residentialArea: null })).toEqual({
      firstName: "Amina",
      lastName: "Otieno",
      email: "",
      residentialArea: "",
    });
  });
});
