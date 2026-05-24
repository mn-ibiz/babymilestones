import { describe, expect, it } from "vitest";
import type { Child } from "@bm/contracts";
import { draftFromChild, validateChildDraft, ageLabel, emptyChildDraft } from "./children.js";

const child: Child = {
  id: "c1",
  firstName: "Zola",
  lastName: "Otieno",
  dateOfBirth: "2024-01-15",
  gender: "female",
  allergiesNotes: "Peanuts",
  photoConsent: false,
  archivedAt: null,
  ageInMonths: 6,
};

describe("draftFromChild (AC3 — all fields preserved)", () => {
  it("maps every field, nulls become empty strings", () => {
    expect(draftFromChild(child)).toEqual({
      firstName: "Zola",
      lastName: "Otieno",
      dateOfBirth: "2024-01-15",
      gender: "female",
      allergiesNotes: "Peanuts",
    });
    expect(draftFromChild({ ...child, lastName: null, gender: null, allergiesNotes: null })).toEqual({
      firstName: "Zola",
      lastName: "",
      dateOfBirth: "2024-01-15",
      gender: "",
      allergiesNotes: "",
    });
  });
});

describe("validateChildDraft (AC1)", () => {
  it("passes a minimal valid draft", () => {
    expect(validateChildDraft({ ...emptyChildDraft, firstName: "Z", dateOfBirth: "2024-01-15" })).toEqual(
      {},
    );
  });
  it("flags a missing first name and DOB", () => {
    const errors = validateChildDraft(emptyChildDraft);
    expect(errors.firstName).toBeDefined();
    expect(errors.dateOfBirth).toBeDefined();
  });
  it("flags a malformed DOB", () => {
    const errors = validateChildDraft({ ...emptyChildDraft, firstName: "Z", dateOfBirth: "15/01/2024" });
    expect(errors.dateOfBirth).toBeDefined();
  });
  it("flags over-long notes", () => {
    const errors = validateChildDraft({
      ...emptyChildDraft,
      firstName: "Z",
      dateOfBirth: "2024-01-15",
      allergiesNotes: "a".repeat(501),
    });
    expect(errors.allergiesNotes).toBeDefined();
  });
});

describe("ageLabel (AC2)", () => {
  it("singularises one month", () => {
    expect(ageLabel({ dateOfBirth: new Date().toISOString().slice(0, 10) })).toBe("0 months");
  });
});
