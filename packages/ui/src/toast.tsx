import * as React from "react";
import { cn } from "./cn.js";
import { FOCUS_RING } from "./styles.js";

export type ToastVariant = "info" | "success" | "warn" | "danger";

export interface ToastProps {
  message: React.ReactNode;
  variant?: ToastVariant;
  /** Optional dismiss handler; renders a close button when provided. */
  onDismiss?: () => void;
  className?: string;
}

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  info: "bg-neutral-900 text-white",
  success: "bg-success text-white",
  warn: "bg-warn text-neutral-900",
  danger: "bg-danger text-white",
};

/**
 * `Toast` — transient notification. Uses `role="status"` + `aria-live` so it is
 * announced without stealing focus; danger toasts escalate to `role="alert"`.
 */
export function Toast({
  message,
  variant = "info",
  onDismiss,
  className,
}: ToastProps) {
  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      aria-live={variant === "danger" ? "assertive" : "polite"}
      className={cn(
        "flex items-center gap-3 rounded-md px-4 py-3 text-sm shadow-lg",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      <span className="flex-1">{message}</span>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className={cn(
            "rounded-sm px-1 text-current opacity-80 hover:opacity-100",
            FOCUS_RING,
          )}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
