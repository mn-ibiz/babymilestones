/**
 * `AutoCreditStatus` (P2-E07-S03) — the parent's read-only view of whether an
 * admin has enabled auto-credit (the "allowed to go negative" capability flipped
 * elsewhere in story P1-E03-S07). It only *announces* the state — there is no
 * toggle, button, or input the parent can touch (AC3): the flag is admin-owned.
 *
 * - Enabled → "Auto-credit: Enabled by admin" (AC1).
 * - Disabled → "Auto-credit: Not enabled" plus helper copy that explains exactly
 *   what to do instead: "Top up before booking to avoid an outstanding balance"
 *   (AC2). When enabled there is nothing to warn about, so no helper renders.
 *
 * Styling is brand tokens only (no ad-hoc hex), matching the other read-only
 * wallet surfaces.
 */
import * as React from "react";
import { cn } from "./cn.js";

/** Exact disabled-state helper copy (AC2) — single-sourced for tests + UI. */
export const AUTO_CREDIT_DISABLED_HELP =
  "Top up before booking to avoid an outstanding balance";

export interface AutoCreditStatusProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Current `wallets.auto_credit_enabled`, admin-owned. Read-only here (AC3). */
  enabled: boolean;
}

export const AutoCreditStatus = React.forwardRef<
  HTMLDivElement,
  AutoCreditStatusProps
>(function AutoCreditStatus({ enabled, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      aria-label="Auto-credit status"
      className={cn("text-sm text-neutral-700", className)}
      {...rest}
    >
      <p className="font-medium text-neutral-900">
        Auto-credit: {enabled ? "Enabled by admin" : "Not enabled"}
      </p>
      {/* AC3: a plain, non-interactive note — no control to flip the flag. */}
      {!enabled && (
        <p className="mt-1 text-neutral-500">{AUTO_CREDIT_DISABLED_HELP}</p>
      )}
    </div>
  );
});
