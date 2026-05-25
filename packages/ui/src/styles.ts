/**
 * Shared Tailwind class fragments for the primitive library (X7-S02).
 *
 * Every interactive primitive composes {@link FOCUS_RING} so keyboard users get
 * a consistent, visible focus indicator (AC2). Colours reference the brand
 * preset tokens (`primary-*`, `neutral-*`, `danger`) from X7-S01 — never raw
 * hex — so the design system stays single-sourced.
 */

/** Visible, keyboard-only focus ring (uses `focus-visible`, not `focus`). */
export const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2";
