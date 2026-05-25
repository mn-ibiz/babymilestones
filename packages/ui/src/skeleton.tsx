import * as React from "react";
import { cn } from "./cn.js";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * `Skeleton` — content placeholder shown while data loads. Marked
 * `aria-hidden` (it conveys no information) and `data-testid` for assertions.
 */
export function Skeleton({ className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-neutral-200",
        className,
      )}
      {...rest}
    />
  );
}
