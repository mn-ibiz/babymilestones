/**
 * `OutstandingBalanceBanner` (P2-E07-S01) — the parent-dashboard nudge that
 * surfaces an unpaid balance so a parent never forgets they owe. Rendered once in
 * the parent shell so it appears on every page (AC1).
 *
 * The banner is purely data-driven: it announces "You owe KES X. Top up to
 * settle." only while money is owed (the shared {@link isOutstanding} rule from
 * `@bm/contracts`, AC1) and renders nothing otherwise — so it disappears on its
 * own the moment the balance is settled (AC3). The CTA hands off to the top-up
 * flow (AC2). Money is integer cents, formatted to KES at the edge with
 * {@link formatKes}; styling is brand tokens only (the `warn` accent), no ad-hoc hex.
 */
import * as React from "react";
import { isOutstanding } from "@bm/contracts";
import { cn } from "./cn.js";
import { formatKes } from "./money.js";
import { FOCUS_RING } from "./styles.js";

export interface OutstandingBalanceBannerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Outstanding amount owed, in integer cents. The banner hides when not > 0. */
  outstandingCents: number;
  /** Where the "Top up" CTA hands off — the top-up flow (P1-E11-S03). */
  topUpHref?: string;
}

export const OutstandingBalanceBanner = React.forwardRef<
  HTMLDivElement,
  OutstandingBalanceBannerProps
>(function OutstandingBalanceBanner(
  { outstandingCents, topUpHref = "/top-up", className, ...rest },
  ref,
) {
  // AC3: visibility is derived from the data alone — once settled (outstanding
  // is no longer > 0), nothing renders, so the banner clears itself.
  if (!isOutstanding(outstandingCents)) return null;

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      aria-label="Outstanding balance"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md bg-warn px-4 py-3 text-sm text-neutral-900",
        className,
      )}
      {...rest}
    >
      <p className="font-medium">
        You owe {formatKes(outstandingCents)}. Top up to settle.
      </p>
      <a
        href={topUpHref}
        className={cn(
          "shrink-0 rounded-sm font-semibold underline underline-offset-2",
          FOCUS_RING,
        )}
      >
        Top up
      </a>
    </div>
  );
});
