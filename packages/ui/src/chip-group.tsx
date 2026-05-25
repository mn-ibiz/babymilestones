import * as React from "react";
import { cn } from "./cn.js";
import { FOCUS_RING } from "./styles.js";

export interface ChipOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface ChipGroupProps {
  options: ChipOption[];
  /** Controlled selected value (single-select). */
  value: string | null;
  onValueChange: (value: string) => void;
  /** Accessible group label. */
  label: string;
  className?: string;
}

/**
 * `ChipGroup` — single-select pill group (e.g. quick top-up amounts). Built as
 * a `role="radiogroup"` of `role="radio"` chips so arrow keys and Space/Enter
 * work; the selected chip carries `aria-checked` and the brand fill.
 */
export function ChipGroup({
  options,
  value,
  onValueChange,
  label,
  className,
}: ChipGroupProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
              selected
                ? "border-primary-500 bg-primary-500 text-white"
                : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100",
              FOCUS_RING,
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
