/**
 * POS tablet-first layout constants (P2-E04-S01 AC3).
 *
 * The POS runs on an in-store tablet in landscape. These constants are the
 * single source of truth for the breakpoint + touch-target floor; `globals.css`
 * and the shell components consume them so the layout rules stay testable and
 * are never re-stated as magic numbers in JSX.
 */

/** Minimum viewport width the POS layout is designed for (a tablet, landscape). */
export const TABLET_MIN_WIDTH = 768;

/**
 * Minimum touch-target edge in CSS pixels. WCAG 2.5.5 (enhanced) is 44px; the
 * till buttons go a touch larger for fast, in-store, possibly-gloved use.
 */
export const MIN_TOUCH_TARGET_PX = 48;

/** True when the viewport is wide enough for the tablet layout (AC3). */
export function meetsTabletLayout(width: number): boolean {
  return width >= TABLET_MIN_WIDTH;
}

/** True when the device is in landscape (width strictly greater than height). */
export function isLandscape(width: number, height: number): boolean {
  return width > height;
}

/**
 * The full AC3 contract: the POS layout is supported only on a landscape tablet
 * at or above the tablet breakpoint. `ViewportGuard` consumes this to show a
 * "rotate / use a wider screen" notice rather than rendering the landscape-only
 * two-pane till on a portrait or too-narrow viewport.
 */
export function supportsPosLayout(width: number, height: number): boolean {
  return meetsTabletLayout(width) && isLandscape(width, height);
}
