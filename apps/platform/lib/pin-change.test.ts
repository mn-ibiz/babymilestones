import { describe, expect, it } from "vitest";
import { emptyPinChange, validatePinChange, type PinChangeDraft } from "./pin-change.js";

const draft = (over: Partial<PinChangeDraft> = {}): PinChangeDraft => ({
  ...emptyPinChange,
  ...over,
});

describe("validatePinChange (P1-E11-S04 AC3)", () => {
  it("requires the current PIN", () => {
    const errors = validatePinChange(draft({ newPin: "8642", confirmPin: "8642" }));
    expect(errors.currentPin).toBeDefined();
  });

  it("requires a 4-digit new PIN", () => {
    expect(validatePinChange(draft({ currentPin: "1357", newPin: "12", confirmPin: "12" })).newPin).toBeDefined();
    expect(validatePinChange(draft({ currentPin: "1357", newPin: "abcd", confirmPin: "abcd" })).newPin).toBeDefined();
  });

  it("rejects a new PIN equal to the current PIN", () => {
    const errors = validatePinChange(draft({ currentPin: "1357", newPin: "1357", confirmPin: "1357" }));
    expect(errors.newPin).toBeDefined();
  });

  it("rejects a confirmation that does not match the new PIN", () => {
    const errors = validatePinChange(draft({ currentPin: "1357", newPin: "8642", confirmPin: "8641" }));
    expect(errors.confirmPin).toBeDefined();
  });

  it("passes a well-formed, distinct, matching change", () => {
    expect(validatePinChange(draft({ currentPin: "1357", newPin: "8642", confirmPin: "8642" }))).toEqual({});
  });
});
