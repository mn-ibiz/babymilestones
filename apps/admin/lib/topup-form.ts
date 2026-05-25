/**
 * Reception top-up sheet logic (P1-E05-S03). Framework-agnostic + dependency-free
 * so it unit-tests without a DOM and the Next bundle never pulls server-only code
 * from @bm/payments. The React sheet (app/reception/page.tsx) wires these to the
 * amount field + method picker.
 *
 *  - method labels + the picker order (AC1).
 *  - `validateTopup`  — client-side mirror of the contract (whole-KES amount in
 *                       bounds, a method chosen) for instant feedback; the server
 *                       (`POST /reception/topup`) re-validates authoritatively.
 *  - `kesToCents`     — the amount field is whole KES; the contract takes cents.
 *  - `topupStatusLabel` / `isLivePolling` — drive the live STK status (AC2) and
 *                       the cash "receipt printed" terminal state (AC3).
 */

import {
  CASH_TOPUP_MIN_CENTS,
  CASH_TOPUP_MAX_CENTS,
  RECEPTION_TOPUP_METHODS,
  type ReceptionTopupMethod,
  type ReceptionTopupResponse,
  type ReceptionTopupStatus,
} from "@bm/contracts";

/** The picker options in display order (AC1). */
export const TOPUP_METHOD_OPTIONS: ReadonlyArray<{
  value: ReceptionTopupMethod;
  label: string;
}> = [
  { value: "cash", label: "Cash" },
  { value: "mpesa_stk", label: "M-Pesa STK" },
  { value: "paystack_card", label: "Paystack card" },
  { value: "bank_transfer", label: "Bank transfer" },
];

/** Whole-KES amount bounds derived from the cents contract bounds. */
export const TOPUP_MIN_KES = CASH_TOPUP_MIN_CENTS / 100;
export const TOPUP_MAX_KES = CASH_TOPUP_MAX_CENTS / 100;

/** Whole-KES (field) → integer cents (contract). */
export function kesToCents(amountKes: number): number {
  return Math.round(amountKes * 100);
}

export interface TopupFormValues {
  /** Whole-KES amount as typed in the field. */
  amountKes: number;
  method: ReceptionTopupMethod | "";
}

export interface TopupValidation {
  ok: boolean;
  errors: Partial<Record<"amountKes" | "method", string>>;
}

/** Instant client-side validation (server re-validates authoritatively). */
export function validateTopup(v: TopupFormValues): TopupValidation {
  const errors: TopupValidation["errors"] = {};
  if (v.method === "" || !RECEPTION_TOPUP_METHODS.includes(v.method)) {
    errors.method = "Choose a payment method";
  }
  if (!Number.isFinite(v.amountKes) || !Number.isInteger(v.amountKes)) {
    errors.amountKes = "Enter a whole shilling amount";
  } else if (v.amountKes < TOPUP_MIN_KES) {
    errors.amountKes = `Minimum top-up is KES ${TOPUP_MIN_KES}`;
  } else if (v.amountKes > TOPUP_MAX_KES) {
    errors.amountKes = `Maximum top-up is KES ${TOPUP_MAX_KES}`;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** True when the form can be submitted. */
export function canSubmitTopup(validation: TopupValidation): boolean {
  return validation.ok;
}

/** Human-facing status copy for the sheet (AC2/AC3). */
export function topupStatusLabel(
  method: ReceptionTopupMethod,
  status: ReceptionTopupStatus,
): string {
  if (status === "settled") {
    return method === "cash" ? "Paid — receipt printed" : "Paid";
  }
  if (status === "failed") return "Payment failed";
  // pending
  if (method === "mpesa_stk") return "STK sent — awaiting the parent's phone…";
  if (method === "paystack_card") return "Awaiting card payment…";
  return "Pending…";
}

/** True while the sheet should keep polling the STK status endpoint (AC2). */
export function isLivePolling(response: ReceptionTopupResponse): boolean {
  return response.method === "mpesa_stk" && response.status === "pending";
}

/** The live STK status poll URL for a started top-up (AC2). */
export function stkStatusUrl(transactionId: string): string {
  return `/api/reception/topup/mpesa_stk/${encodeURIComponent(transactionId)}`;
}
