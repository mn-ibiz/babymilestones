import { describe, expect, it } from "vitest";
import type { PickupAuthorisation } from "@bm/contracts";
import {
  draftFromPickup,
  emptyPickupDraft,
  pickupBody,
  validatePickupDraft,
} from "./pickups";

const sample: PickupAuthorisation = {
  id: "p1",
  childId: "c1",
  name: "Mary Otieno",
  phone: "0722000111",
  relationship: "Aunt",
  photoUrl: "https://cdn.example.com/mary.jpg",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

describe("validatePickupDraft (AC1)", () => {
  it("flags missing required fields", () => {
    const errors = validatePickupDraft(emptyPickupDraft);
    expect(errors.name).toBeDefined();
    expect(errors.phone).toBeDefined();
    expect(errors.relationship).toBeDefined();
  });

  it("accepts a valid draft with no photo", () => {
    const errors = validatePickupDraft({
      name: "Joe",
      phone: "0700000000",
      relationship: "Uncle",
      photoUrl: "",
    });
    expect(errors).toEqual({});
  });

  it("flags an over-long name", () => {
    const errors = validatePickupDraft({
      name: "a".repeat(121),
      phone: "0700000000",
      relationship: "Uncle",
      photoUrl: "",
    });
    expect(errors.name).toBeDefined();
  });
});

describe("draftFromPickup (AC2)", () => {
  it("round-trips every field, null photo → empty string", () => {
    expect(draftFromPickup(sample)).toEqual({
      name: "Mary Otieno",
      phone: "0722000111",
      relationship: "Aunt",
      photoUrl: "https://cdn.example.com/mary.jpg",
    });
    expect(draftFromPickup({ ...sample, photoUrl: null }).photoUrl).toBe("");
  });
});

describe("pickupBody", () => {
  it("trims fields and collapses an empty photo URL to null", () => {
    expect(
      pickupBody({ name: " Joe ", phone: " 0700 ", relationship: " Uncle ", photoUrl: "  " }),
    ).toEqual({ name: "Joe", phone: "0700", relationship: "Uncle", photoUrl: null });
  });
});
