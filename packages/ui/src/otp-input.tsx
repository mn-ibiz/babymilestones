import * as React from "react";
import { cn } from "./cn.js";
import { FOCUS_RING } from "./styles.js";

export interface OTPInputProps {
  /** Controlled OTP value (digits only). */
  value: string;
  onValueChange: (value: string) => void;
  /** Number of digit boxes. Default 6. */
  length?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * `OTPInput` — fixed-length numeric one-time-code entry. Renders one box per
 * digit; typing advances focus, Backspace on an empty box steps back. Each box
 * is a native input so it is keyboard-operable with a visible focus ring.
 */
export function OTPInput({
  value,
  onValueChange,
  length = 6,
  disabled,
  className,
  "aria-label": ariaLabel = "One-time code",
}: OTPInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);
  const chars = value.split("").slice(0, length);

  const setDigit = (index: number, digit: string) => {
    const clean = digit.replace(/[^0-9]/g, "").slice(-1);
    const next = value.padEnd(length, " ").split("");
    next[index] = clean || " ";
    onValueChange(next.join("").replace(/ /g, "").slice(0, length));
    if (clean && index < length - 1) refs.current[index + 1]?.focus();
  };

  const onKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !chars[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex gap-2", className)}
    >
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          value={chars[i] ?? ""}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          className={cn(
            "h-12 w-10 rounded-md border border-neutral-200 bg-white text-center text-lg text-neutral-900 disabled:opacity-50",
            FOCUS_RING,
          )}
        />
      ))}
    </div>
  );
}
