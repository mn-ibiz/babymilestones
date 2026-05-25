/**
 * Client-side PIN-change validation (P1-E11-S04 AC3). Mirrors the contract's
 * `pinChangeSchema` for fast UX and adds a confirm-PIN match (a UI-only field).
 * The API re-validates and is the sole authority on current-PIN verification +
 * weak-PIN rejection (it owns the argon2 hash). Logic is pure + unit-tested.
 */

export interface PinChangeDraft {
  currentPin: string;
  newPin: string;
  confirmPin: string;
}

export const emptyPinChange: PinChangeDraft = {
  currentPin: "",
  newPin: "",
  confirmPin: "",
};

const FOUR_DIGITS = /^\d{4}$/u;

/** Per-field errors; an empty object means the draft is valid. */
export function validatePinChange(
  draft: PinChangeDraft,
): Partial<Record<keyof PinChangeDraft, string>> {
  const errors: Partial<Record<keyof PinChangeDraft, string>> = {};

  if (!FOUR_DIGITS.test(draft.currentPin)) {
    errors.currentPin = "Enter your current 4-digit PIN";
  }
  if (!FOUR_DIGITS.test(draft.newPin)) {
    errors.newPin = "New PIN must be 4 digits";
  } else if (draft.newPin === draft.currentPin) {
    errors.newPin = "New PIN must be different from your current PIN";
  }
  if (draft.confirmPin !== draft.newPin) {
    errors.confirmPin = "PINs do not match";
  }

  return errors;
}
