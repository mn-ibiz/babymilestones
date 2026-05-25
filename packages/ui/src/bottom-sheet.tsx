import * as React from "react";
import { cn } from "./cn.js";
import { FOCUS_RING } from "./styles.js";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible title; wired to the dialog via `aria-labelledby`. */
  title: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * `BottomSheet` — modal sheet anchored to the bottom of the viewport (the P1
 * mobile pattern). Renders a labelled `role="dialog"` with `aria-modal`, closes
 * on Escape and on backdrop click, and moves focus into the sheet on open.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
}: BottomSheetProps) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        data-testid="bottom-sheet-backdrop"
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-neutral-900/50"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-md rounded-t-lg bg-white p-4 shadow-xl",
          FOCUS_RING,
          className,
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold text-neutral-900">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn("rounded-sm px-2 text-neutral-500", FOCUS_RING)}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
