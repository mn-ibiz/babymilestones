/**
 * `MpesaPushPrompt` (X7-S03) — the M-Pesa STK push status surface shown while a
 * parent confirms a top-up on their phone. Props are typed against the
 * {@link MpesaStkState} lifecycle from `@bm/contracts` (no locally redefined
 * states). Pending states announce politely via `role="status"`; terminal
 * failures escalate to `role="alert"`. Composed from brand tokens only.
 */
import * as React from "react";
import type { MpesaStkState } from "@bm/contracts";
import { cn } from "./cn.js";

export interface MpesaPushPromptProps
  extends React.HTMLAttributes<HTMLDivElement> {
  state: MpesaStkState;
  /** Whole-shilling amount being topped up (Daraja transacts in whole KES). */
  amountKes: number;
  /** Optional payer phone, for the "check your phone" copy. */
  phone?: string;
}

const COPY: Record<MpesaStkState, string> = {
  INITIATED: "Starting your M-Pesa request…",
  STK_SENT: "Check your phone and enter your M-Pesa PIN to confirm.",
  CALLBACK_PENDING: "Waiting for M-Pesa to confirm your payment…",
  SUCCEEDED: "Payment received — your wallet has been topped up.",
  FAILED: "The M-Pesa payment failed. No money was taken — please try again.",
  EXPIRED: "The M-Pesa request expired before it was confirmed. Please try again.",
};

const TERMINAL_FAILURES: ReadonlySet<MpesaStkState> = new Set<MpesaStkState>([
  "FAILED",
  "EXPIRED",
]);

export const MpesaPushPrompt = React.forwardRef<
  HTMLDivElement,
  MpesaPushPromptProps
>(function MpesaPushPrompt({ state, amountKes, phone, className, ...rest }, ref) {
  const isFailure = TERMINAL_FAILURES.has(state);
  return (
    <div
      ref={ref}
      role={isFailure ? "alert" : "status"}
      aria-live={isFailure ? "assertive" : "polite"}
      className={cn(
        "rounded-lg border p-4",
        isFailure
          ? "border-danger bg-white text-danger"
          : "border-neutral-200 bg-white text-neutral-900",
        className,
      )}
      {...rest}
    >
      <div className="text-sm font-medium text-neutral-500">
        M-Pesa top-up · KES {amountKes}
      </div>
      <p className="mt-1 text-base">{COPY[state]}</p>
      {phone ? (
        <p className="mt-1 text-xs text-neutral-500">Sent to {phone}</p>
      ) : null}
    </div>
  );
});
