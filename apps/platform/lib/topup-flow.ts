/**
 * Parent dashboard top-up flow logic (P1-E11-S03). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM and never pulls server-only
 * code into the Next bundle. The top-up page (`app/top-up/`) consumes these pure
 * functions to dispatch the chosen method (AC1/AC2/AC3), validate the amount
 * (AC1/AC2), drive the pending → terminal status display for the async rails
 * (AC1/AC2), render the bank-transfer instructions (AC3), and show failure
 * remediation copy (AC4).
 *
 * The two async rails (M-Pesa STK, Paystack card) and their amount/state
 * primitives already exist (P1-E04-S01/S04); this layer is the shared dispatch +
 * pending-state seam the dashboard top-up flow wires them through, plus the
 * bank-transfer instructions screen which is the only net-new rail here.
 */
import {
  MPESA_STK_MIN_KES,
  MPESA_STK_MAX_KES,
  type MpesaStkState,
  type PaystackTxState,
} from "@bm/contracts";

/** The three rails the dashboard top-up flow offers, in display order. */
export const TOPUP_METHOD_KEYS = ["mpesa", "card", "bank"] as const;
export type TopUpMethodKey = (typeof TOPUP_METHOD_KEYS)[number];

/** Precise type guard for a method key off the wire / a query param. */
export function isTopUpMethod(value: unknown): value is TopUpMethodKey {
  return typeof value === "string" && (TOPUP_METHOD_KEYS as readonly string[]).includes(value);
}

/**
 * How a rail behaves once chosen: M-Pesa is an in-page async STK push, card is a
 * redirect to hosted checkout, bank is a manual instructions screen (admin
 * confirms out-of-band). `anchor` is the section heading the method picker scrolls
 * to on the top-up page.
 */
export type TopUpMethodKind = "async-stk" | "async-redirect" | "manual-instructions";

export interface ResolvedTopUpMethod {
  key: TopUpMethodKey;
  kind: TopUpMethodKind;
  anchor: string;
}

const METHOD_TABLE: Readonly<Record<TopUpMethodKey, ResolvedTopUpMethod>> = {
  mpesa: { key: "mpesa", kind: "async-stk", anchor: "mpesa-heading" },
  card: { key: "card", kind: "async-redirect", anchor: "card-heading" },
  bank: { key: "bank", kind: "manual-instructions", anchor: "bank-heading" },
};

/** Resolve a (possibly untrusted) method string to its dispatch descriptor, or null. */
export function resolveTopUpMethod(value: unknown): ResolvedTopUpMethod | null {
  return isTopUpMethod(value) ? METHOD_TABLE[value] : null;
}

/**
 * Amount guard shared by the async rails (AC1/AC2). Money is integer cents
 * everywhere; the parent enters whole shillings, so a fractional value is
 * rejected before it can ever produce fractional cents. Bounds mirror the M-Pesa
 * contract bounds (the card rail shares the same minimum and a higher ceiling, so
 * the M-Pesa max is the conservative shared gate for the picker).
 */
export function validateTopUpAmount(amountKes: number): string | null {
  if (!Number.isInteger(amountKes)) return "Enter a whole number of shillings";
  if (amountKes < MPESA_STK_MIN_KES) return `Minimum top-up is KES ${MPESA_STK_MIN_KES}`;
  if (amountKes > MPESA_STK_MAX_KES) return `Maximum per top-up is KES ${MPESA_STK_MAX_KES}`;
  return null;
}

/** The pending/terminal view of an async top-up, derived from the provider state. */
export interface TopUpPendingState {
  /** Still in flight — show the "pending" indicator. */
  pending: boolean;
  /** Reached a confirmed-success terminal state. */
  succeeded: boolean;
  /** Reached a failed/abandoned terminal state. */
  failed: boolean;
  /** True once the UI should stop polling (any terminal state). */
  stopPolling: boolean;
}

/**
 * Collapse a rail's provider state (M-Pesa STK or Paystack) — or `null` before a
 * charge is initiated — into the shared pending/terminal view (AC1/AC2). The
 * actual wallet credit lands asynchronously via the epic-4 callback/webhook; this
 * is the UX-only reflection of where the charge is.
 */
export function topUpPendingState(
  state: MpesaStkState | PaystackTxState | null,
): TopUpPendingState {
  if (state === null) {
    return { pending: false, succeeded: false, failed: false, stopPolling: false };
  }
  if (state === "SUCCEEDED") {
    return { pending: false, succeeded: true, failed: false, stopPolling: true };
  }
  if (state === "FAILED" || state === "ABANDONED") {
    return { pending: false, succeeded: false, failed: true, stopPolling: true };
  }
  // Any other state (STK_SENT, STK_PENDING, INITIALIZED, …) is still in flight.
  return { pending: true, succeeded: false, failed: false, stopPolling: false };
}

/**
 * Bank-transfer destination + confirmation copy (AC3). The parent transfers
 * out-of-band to this account and an admin confirms it (P1-E04-S07) — there is no
 * in-app charge to initiate, so this is a static instructions screen.
 */
export const BANK_TRANSFER_INSTRUCTIONS = {
  accountName: "Baby Milestones Ltd",
  bankName: "Equity Bank",
  accountNumber: "0100123456789",
  branch: "Westlands",
  note: "Use your phone number as the reference. An admin will confirm and credit your wallet, usually within one business day.",
} as const;

/** Ordered, human-readable instruction lines for the bank-transfer screen (AC3). */
export function bankInstructionLines(): string[] {
  const b = BANK_TRANSFER_INSTRUCTIONS;
  return [
    `Send your top-up to ${b.accountName}.`,
    `Bank: ${b.bankName} · Account: ${b.accountNumber} · Branch: ${b.branch}.`,
    b.note,
  ];
}

/** Clear, actionable remediation copy for a failed top-up on a given rail (AC4). */
export function failureRemediation(method: TopUpMethodKey): string {
  switch (method) {
    case "mpesa":
      return "That M-Pesa payment didn’t go through. Check your phone has enough balance and try again.";
    case "card":
      return "That card payment didn’t go through. Check your card details or try a different card, then try again.";
    case "bank":
    default:
      return "Something went wrong. Please try again, or contact Reception if it keeps failing.";
  }
}
