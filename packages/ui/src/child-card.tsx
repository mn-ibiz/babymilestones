/**
 * `ChildCard` (X7-S03) — the child summary card used on the parent children tab
 * and Reception's booking selectors. Composed from brand tokens; props are the
 * typed {@link Child} from `@bm/contracts` (no locally redefined shape). Age is
 * derived from the contract's `ageInMonths` and humanised here for display.
 */
import * as React from "react";
import type { Child } from "@bm/contracts";
import { cn } from "./cn.js";

export interface ChildCardProps extends React.HTMLAttributes<HTMLDivElement> {
  child: Child;
}

/** Humanise whole months into a compact "2 yrs 4 mo" / "8 mo" label. */
export function formatChildAge(ageInMonths: number): string {
  // Coerce non-finite (NaN/Infinity) to 0 — `Math.max(0, NaN)` is NaN, which would
  // otherwise render "NaN yrs NaN mo" on the card.
  const months = Math.max(0, Math.trunc(Number.isFinite(ageInMonths) ? ageInMonths : 0));
  const years = Math.trunc(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} mo`;
  if (rem === 0) return `${years} yrs`;
  return `${years} yrs ${rem} mo`;
}

export const ChildCard = React.forwardRef<HTMLDivElement, ChildCardProps>(
  function ChildCard({ child, className, ...rest }, ref) {
    const fullName = [child.firstName, child.lastName]
      .filter((p): p is string => Boolean(p))
      .join(" ");
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border border-neutral-200 bg-white p-4 shadow-sm",
          className,
        )}
        {...rest}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-base font-semibold text-neutral-900">
            {fullName}
          </span>
          <span className="text-sm text-neutral-500">
            {formatChildAge(child.ageInMonths)}
          </span>
        </div>
        {child.allergiesNotes ? (
          <p className="mt-2 text-sm text-danger">⚠ {child.allergiesNotes}</p>
        ) : null}
      </div>
    );
  },
);
