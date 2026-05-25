import * as React from "react";
import { cn } from "./cn.js";
import { FOCUS_RING } from "./styles.js";
import { formatKePhoneDisplay, normalizeKePhone } from "./phone.js";

export interface PhoneInputProps {
  /** Controlled raw text the user has typed. */
  value: string;
  /**
   * Fires on every change with both the raw text and the normalised E.164
   * value (`null` until a complete KE number is entered).
   */
  onValueChange: (raw: string, e164: string | null) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * `PhoneInput` — Kenya-specific phone field. Shows the KE flag + `+254` affix,
 * formats the typed national number live, and emits the normalised E.164 value.
 * `inputMode="tel"` for a phone keypad; fully keyboard-operable.
 */
export function PhoneInput({
  value,
  onValueChange,
  invalid,
  disabled,
  className,
  ...aria
}: PhoneInputProps) {
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
      <span aria-hidden="true" className="mr-2 select-none">
        {/* KE flag */}
        <span role="img" aria-label="Kenya">
          🇰🇪
        </span>{" "}
        <span className="text-neutral-500">+254</span>
      </span>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        value={formatKePhoneDisplay(value)}
        onChange={(e) =>
          onValueChange(e.target.value, normalizeKePhone(e.target.value))
        }
        className={cn(
          "h-full w-full bg-transparent text-base text-neutral-900 placeholder:text-neutral-400",
          FOCUS_RING,
        )}
        {...aria}
      />
    </div>
  );
}
