/**
 * Reception walk-in form logic (P1-E02-S02). Framework-agnostic + dependency-free
 * so it unit-tests without a DOM and the Next bundle never pulls argon2 from
 * @bm/auth. The React form (app/reception/walk-in/page.tsx) wires these to inputs.
 *
 *  - `debounce`       — the 300ms client throttle for the live phone-collision
 *                       check (AC2). The server (`GET /parents/phone-check`) is
 *                       the source of truth; this only limits request volume.
 *  - `validateWalkIn` — client-side mirror of the contract (phone required +
 *                       names required; email permissive) for instant feedback.
 *  - phone-check state — the discriminated UI states driving "Open existing" /
 *                        "Merge intent".
 */

/** The live phone-collision check debounce interval (AC2). */
export const PHONE_CHECK_DEBOUNCE_MS = 300;

/** Permissive email mirror of the contract's emailLightRegex. */
const EMAIL_LIGHT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

export interface WalkInFormValues {
  phone: string;
  firstName: string;
  lastName: string;
  email?: string;
  residentialArea?: string;
}

export interface WalkInValidation {
  ok: boolean;
  errors: Partial<Record<keyof WalkInFormValues, string>>;
}

/** Instant client-side validation (server re-validates authoritatively). */
export function validateWalkIn(v: WalkInFormValues): WalkInValidation {
  const errors: WalkInValidation["errors"] = {};
  if (!v.phone.trim()) errors.phone = "Phone is required";
  if (!v.firstName.trim()) errors.firstName = "First name is required";
  if (!v.lastName.trim()) errors.lastName = "Last name is required";
  const email = (v.email ?? "").trim();
  if (email !== "" && !EMAIL_LIGHT.test(email)) errors.email = "Enter a valid email address";
  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * The phone-collision check states (AC2). `duplicate` carries the existing
 * reference so the UI can offer "Open existing" or set a "Merge intent" flag.
 */
export type PhoneCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "duplicate"; existing: { userId: string; firstName: string | null; lastName: string | null } }
  | { status: "error" };

/** The two duplicate-resolution choices the form offers on a collision (AC2). */
export type DuplicateChoice = "open_existing" | "merge_intent";

/** True when the form is submittable: valid AND not a known duplicate. */
export function canSubmit(validation: WalkInValidation, phoneCheck: PhoneCheckState): boolean {
  return validation.ok && phoneCheck.status !== "duplicate" && phoneCheck.status !== "checking";
}

/**
 * A minimal trailing-edge debounce. Calls fire only after `waitMs` of quiet;
 * each new call resets the timer. `cancel()` drops a pending call (e.g. on
 * unmount). Generic over the wrapped function's args.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): ((...args: Args) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: Args): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  };
  wrapped.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  return wrapped;
}
