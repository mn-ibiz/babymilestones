import * as React from "react";
import { cn } from "./cn.js";
import { FOCUS_RING } from "./styles.js";
import { centsToDisplay, displayToCents } from "./money.js";

export interface MoneyInputProps {
  /** Controlled value in integer cents (the canonical internal representation). */
  valueCents: number | null;
  /** Fires with the new integer-cents value (or `null` when cleared). */
  onValueChange: (cents: number | null) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * `MoneyInput` — KES amount field. Displays a decimal amount with a `KES`
 * prefix but emits **integer cents** via {@link onValueChange}; no float ever
 * touches the canonical value. Uses `inputMode="decimal"` for a numeric keypad
 * on mobile and stays fully keyboard-operable.
 */
export function MoneyInput({
  valueCents,
  onValueChange,
  invalid,
  disabled,
  className,
  placeholder = "0.00",
  ...aria
}: MoneyInputProps) {
  const display = valueCents === null ? "" : centsToDisplay(valueCents);

  return (
    <div
      className={cn(
        "inline-flex h-10 w-full items-center rounded-md border bg-white px-3",
        invalid ? "border-danger" : "border-neutral-200",
        "focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      <span aria-hidden="true" className="mr-2 text-neutral-500 select-none">
        KES
      </span>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        value={display}
        placeholder={placeholder}
        onChange={(e) => onValueChange(displayToCents(e.target.value))}
        className={cn(
          "h-full w-full bg-transparent text-base text-neutral-900 placeholder:text-neutral-400",
          FOCUS_RING,
        )}
        {...aria}
      />
    </div>
  );
}
