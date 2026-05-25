/**
 * Parent dashboard shell navigation model (P1-E11-S05).
 *
 * Pure, framework-free description of the four parent tabs plus the active-tab
 * logic. Kept here in `@bm/ui` so it is unit-testable in isolation (vitest, no
 * DOM) and shared by the `ParentShellLayout` rendered in `apps/platform`. The
 * React shell itself lives in the app to keep this package dependency-light and
 * the parent app's initial JS lean (AC3).
 */

/** Stable identifier for a parent nav tab. */
export type ParentNavKey = "home" | "wallet" | "children" | "profile";

/** A single bottom-nav / sidebar entry. `icon` is a token name, not a glyph. */
export interface ParentNavItem {
  readonly key: ParentNavKey;
  readonly label: string;
  readonly href: string;
  readonly icon: string;
}

/**
 * The four parent tabs, in display order: Home / Wallet / Children / Profile.
 * Home is the dashboard root; the others map to the authed `(app)` sections.
 */
export const PARENT_NAV_ITEMS: readonly ParentNavItem[] = [
  { key: "home", label: "Home", href: "/", icon: "home" },
  { key: "wallet", label: "Wallet", href: "/wallet", icon: "wallet" },
  { key: "children", label: "Children", href: "/children", icon: "children" },
  { key: "profile", label: "Profile", href: "/profile", icon: "profile" },
];

/** Strip query/hash and collapse a trailing slash (except for root "/"). */
function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] ?? "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path === "" ? "/" : path;
}

/**
 * True when `item` is the active tab for `pathname`.
 *
 * - Home ("/") matches only the exact root.
 * - A section tab matches its own path and any nested route beneath it
 *   (e.g. "/wallet/statement"), but never a sibling prefix ("/wallets").
 */
export function isNavItemActive(item: ParentNavItem, pathname: string): boolean {
  const path = normalizePath(pathname);
  if (item.href === "/") return path === "/";
  return path === item.href || path.startsWith(item.href + "/");
}

/**
 * The href of the active tab for `pathname`, or `null` when none match.
 * Prefers the most specific (longest href) match so home never shadows a
 * section tab.
 */
export function activeNavHref(pathname: string): string | null {
  let best: ParentNavItem | null = null;
  for (const item of PARENT_NAV_ITEMS) {
    if (!isNavItemActive(item, pathname)) continue;
    if (best === null || item.href.length > best.href.length) best = item;
  }
  return best?.href ?? null;
}
