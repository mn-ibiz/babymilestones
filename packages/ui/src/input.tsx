import * as React from "react";
import { cn } from "./cn.js";
import { FOCUS_RING } from "./styles.js";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Marks the field invalid: sets `aria-invalid` and a danger border. */
  invalid?: boolean;
}

/**
 * `Input` — text field primitive. Native `<input>` so it is keyboard-operable;
 * adds a visible focus ring and an `invalid` state wired to `aria-invalid`.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ invalid, className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-10 w-full rounded-md border bg-white px-3 text-base text-neutral-900 placeholder:text-neutral-400 disabled:opacity-50 disabled:pointer-events-none",
          invalid ? "border-danger" : "border-neutral-200",
          FOCUS_RING,
          className,
        )}
        {...rest}
      />
    );
  },
);
