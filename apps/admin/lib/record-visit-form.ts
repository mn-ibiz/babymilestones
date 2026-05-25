/**
 * Reception record-a-service-visit flow logic (P1-E05-S04). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM and the Next bundle never pulls
 * server-only code. The React flow (app/reception/page.tsx) wires these to the
 * service picker → child picker → staff picker → confirm steps (AC1).
 *
 *  - the three-step picker order + per-step "ready" gates (AC1).
 *  - `validateVisit` — client-side mirror of the contract (a service, child, and
 *    staff chosen; a sane rate) for instant feedback; the server
 *    (`POST /reception/visit`) re-validates authoritatively.
 *  - `kesToCents` — the rate field is whole KES; the contract takes cents.
 *  - `visitOutcomeLabel` / `isVisitWarning` — surface the insufficient-funds
 *    warning while still confirming the visit (AC4).
 */

import {
  SERVICE_RATE_MAX_CENTS,
  STAFF_NAME_SNAPSHOT_MAX,
  isVisitOutstanding,
  type RecordVisitResponse,
  type VisitDebitOutcome,
} from "@bm/contracts";

/** The visit flow steps in order (AC1). */
export const VISIT_STEPS = ["service", "child", "staff", "confirm"] as const;
export type VisitStep = (typeof VISIT_STEPS)[number];

/** Whole-KES rate bounds derived from the cents contract bound. */
export const RATE_MAX_KES = SERVICE_RATE_MAX_CENTS / 100;

/** Whole-KES (field) → integer cents (contract). */
export function kesToCents(amountKes: number): number {
  return Math.round(amountKes * 100);
}

export interface VisitFormValues {
  serviceId: string;
  childId: string;
  staffId: string;
  staffName: string;
  /** Whole-KES rate as typed/loaded for the chosen service. */
  rateKes: number;
}

export interface VisitValidation {
  ok: boolean;
  errors: Partial<Record<"serviceId" | "childId" | "staffId" | "staffName" | "rateKes", string>>;
}

/** Instant client-side validation (server re-validates authoritatively). */
export function validateVisit(v: VisitFormValues): VisitValidation {
  const errors: VisitValidation["errors"] = {};
  if (!v.serviceId) errors.serviceId = "Choose a service";
  if (!v.childId) errors.childId = "Choose a child";
  if (!v.staffId) errors.staffId = "Choose a staff member";
  if (!v.staffName || v.staffName.trim().length === 0) {
    errors.staffName = "A staff member is required";
  } else if (v.staffName.trim().length > STAFF_NAME_SNAPSHOT_MAX) {
    errors.staffName = `Staff name must be ${STAFF_NAME_SNAPSHOT_MAX} characters or fewer`;
  }
  if (!Number.isFinite(v.rateKes) || !Number.isInteger(v.rateKes) || v.rateKes < 0) {
    errors.rateKes = "Enter a whole shilling rate";
  } else if (v.rateKes > RATE_MAX_KES) {
    errors.rateKes = `Rate must be at most KES ${RATE_MAX_KES}`;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** True when the flow can be confirmed. */
export function canConfirmVisit(validation: VisitValidation): boolean {
  return validation.ok;
}

/**
 * The earliest step that is not yet satisfied — drives the wizard's "current"
 * step (AC1). Returns `confirm` once service+child+staff are all chosen.
 */
export function currentVisitStep(v: VisitFormValues): VisitStep {
  if (!v.serviceId) return "service";
  if (!v.childId) return "child";
  if (!v.staffId) return "staff";
  return "confirm";
}

/** Human-facing outcome copy for the confirmation result. */
export function visitOutcomeLabel(outcome: VisitDebitOutcome): string {
  if (outcome === "settled") return "Visit recorded — paid from wallet";
  if (outcome === "settled_on_credit") return "Visit recorded — paid on auto-credit";
  return "Visit recorded — outstanding amount created";
}

/** True when the confirmation should surface the insufficient-funds warning (AC4). */
export function isVisitWarning(response: RecordVisitResponse): boolean {
  return response.warning || isVisitOutstanding(response.outcome);
}
