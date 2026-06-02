import { describe, it, expect } from "vitest";
import { COACHING_AVAILABILITY_WINDOW_DAYS, coachingBookingCreateSchema } from "./index.js";

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
