import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PHONE_CHECK_DEBOUNCE_MS,
  validateWalkIn,
  canSubmit,
  debounce,
  type PhoneCheckState,
} from "./walkin-form.js";

describe("validateWalkIn (P1-E02-S02 AC1)", () => {
  it("requires phone + first + last name", () => {
    const v = validateWalkIn({ phone: "", firstName: "", lastName: "" });
    expect(v.ok).toBe(false);
    expect(v.errors.phone).toBeDefined();
    expect(v.errors.firstName).toBeDefined();
    expect(v.errors.lastName).toBeDefined();
  });

  it("accepts a minimal valid form (PIN not required — AC3)", () => {
    const v = validateWalkIn({ phone: "0712345678", firstName: "A", lastName: "B" });
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual({});
  });

  it("rejects a clearly invalid email but accepts a permissive one", () => {
    expect(validateWalkIn({ phone: "0712345678", firstName: "A", lastName: "B", email: "nope" }).ok).toBe(false);
    expect(validateWalkIn({ phone: "0712345678", firstName: "A", lastName: "B", email: "a+t@sub.host.io" }).ok).toBe(true);
  });
});

describe("canSubmit gating (AC2)", () => {
  const valid = validateWalkIn({ phone: "0712345678", firstName: "A", lastName: "B" });
  it("allows submit when valid and phone is available", () => {
    expect(canSubmit(valid, { status: "available" })).toBe(true);
    expect(canSubmit(valid, { status: "idle" })).toBe(true);
  });
  it("blocks submit while a duplicate is known or a check is in flight", () => {
    const dup: PhoneCheckState = { status: "duplicate", existing: { userId: "u1", firstName: "Amina", lastName: "Otieno" } };
    expect(canSubmit(valid, dup)).toBe(false);
    expect(canSubmit(valid, { status: "checking" })).toBe(false);
  });
  it("blocks submit when the form is invalid", () => {
    const invalid = validateWalkIn({ phone: "", firstName: "", lastName: "" });
    expect(canSubmit(invalid, { status: "available" })).toBe(false);
  });
});

describe("debounce (AC2 — 300ms phone-collision check)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires once after the quiet window, with the latest args", () => {
    const spy = vi.fn();
    const d = debounce(spy, PHONE_CHECK_DEBOUNCE_MS);
    d("071"); d("0712"); d("07123");
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PHONE_CHECK_DEBOUNCE_MS - 1);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("07123");
  });

  it("uses a 300ms interval by default", () => {
    expect(PHONE_CHECK_DEBOUNCE_MS).toBe(300);
  });

  it("cancel() drops a pending call", () => {
    const spy = vi.fn();
    const d = debounce(spy, PHONE_CHECK_DEBOUNCE_MS);
    d("x");
    d.cancel();
    vi.advanceTimersByTime(PHONE_CHECK_DEBOUNCE_MS);
    expect(spy).not.toHaveBeenCalled();
  });
});
