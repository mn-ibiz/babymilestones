import * as React from "react";
import { cn } from "./cn.js";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  /** Accessible label announced to screen readers. */
  label?: string;
}

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-[3px]",
};

/**
 * `Spinner` — indeterminate loading indicator. Exposes `role="status"` with an
 * accessible label so assistive tech announces the loading state.
 */
export function Spinner({
  size = "md",
  label = "Loading",
  className,
  ...rest
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block animate-spin rounded-full border-primary-500 border-t-transparent",
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    />
  );
}
