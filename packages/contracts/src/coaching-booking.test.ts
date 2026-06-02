import { describe, it, expect } from "vitest";
import {
  COACHING_AVAILABILITY_WINDOW_DAYS,
  COACHING_CAPACITY_MAX,
  coachingBookingCreateSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
} from "./index.js";

/**
 * P5-E01-S02 (Story 31.2) — 1:1 coaching booking DTO. Mirrors the salon booking
 * schema: the confirm payload is a uuid-validated (coachingSlotId + childId) with
 * an OPTIONAL uuid coach pick.
 */
describe("coachingBookingCreateSchema (P5-E01-S02 AC3/AC4)", () => {
  const slot = "11111111-1111-1111-1111-111111111111";
  const child = "22222222-2222-2222-2222-222222222222";
  const coach = "33333333-3333-3333-3333-333333333333";

  it("accepts a slot + child with no coach (optional staffId)", () => {
    const parsed = coachingBookingCreateSchema.safeParse({ coachingSlotId: slot, childId: child });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.staffId).toBeUndefined();
  });

  it("accepts a slot + child + coach", () => {
    const parsed = coachingBookingCreateSchema.safeParse({
      coachingSlotId: slot,
      childId: child,
      staffId: coach,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.staffId).toBe(coach);
  });

  it("rejects a non-uuid coachingSlotId", () => {
    const parsed = coachingBookingCreateSchema.safeParse({ coachingSlotId: "nope", childId: child });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-uuid childId", () => {
    const parsed = coachingBookingCreateSchema.safeParse({ coachingSlotId: slot, childId: "nope" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-uuid staffId when supplied", () => {
    const parsed = coachingBookingCreateSchema.safeParse({
      coachingSlotId: slot,
      childId: child,
      staffId: "nope",
    });
    expect(parsed.success).toBe(false);
  });

  it("exposes a 60-day browse window", () => {
    expect(COACHING_AVAILABILITY_WINDOW_DAYS).toBe(60);
  });
});

/**
 * P5-E01-S03 (Story 31.3) — group coaching capacity on the offering. A group
 * offering carries `coachingCapacity > 1` (seats per slot); a 1:1 offering is
 * capacity 1. The field is optional + integer ≥ 1, with a sane ceiling.
 */
describe("coachingCapacity field (P5-E01-S03 AC1)", () => {
  it("accepts a positive integer capacity on create", () => {
    const parsed = serviceCreateSchema.safeParse({
      name: "New-parent group",
      unit: "coaching",
      format: "group",
      coachingDurationMinutes: 90,
      coachingCapacity: 8,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.coachingCapacity).toBe(8);
  });

  it("defaults to undefined when omitted on create (unset)", () => {
    const parsed = serviceCreateSchema.safeParse({ name: "C", unit: "coaching" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.coachingCapacity).toBeUndefined();
  });

  it("accepts a null capacity on update (clears it)", () => {
    const parsed = serviceUpdateSchema.safeParse({ coachingCapacity: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.coachingCapacity).toBeNull();
  });

  it("accepts capacity 1 (a 1:1 offering)", () => {
    expect(serviceCreateSchema.safeParse({ name: "C", unit: "coaching", coachingCapacity: 1 }).success).toBe(true);
  });

  it("rejects a zero / negative capacity", () => {
    expect(serviceCreateSchema.safeParse({ name: "C", unit: "coaching", coachingCapacity: 0 }).success).toBe(false);
    expect(serviceCreateSchema.safeParse({ name: "C", unit: "coaching", coachingCapacity: -3 }).success).toBe(false);
  });

  it("rejects a non-integer capacity", () => {
    expect(serviceCreateSchema.safeParse({ name: "C", unit: "coaching", coachingCapacity: 2.5 }).success).toBe(false);
  });

  it("rejects a capacity above the ceiling", () => {
    expect(
      serviceCreateSchema.safeParse({ name: "C", unit: "coaching", coachingCapacity: COACHING_CAPACITY_MAX + 1 }).success,
    ).toBe(false);
  });
});
