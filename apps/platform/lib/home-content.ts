/**
 * Public marketing home page content model (P1-E12-S01).
 *
 * Pure, framework-free description of the landing page: the hero (real-child
 * photo + headline + primary CTA), the four-unit strip (Play / Talent / Salon /
 * Toy Shop), and the perf budget. Kept here so all content/derivation logic is
 * unit-testable in isolation (vitest, no DOM) and the `(public)/page.tsx` server
 * component stays a thin render of these values.
 *
 * Toy Shop is the standalone WooCommerce site (a separate system — POS pulls
 * orders + syncs stock, no SSO), so it is an EXTERNAL link, never an internal
 * route. The other three units route into the authed sign-up/booking funnel.
 */

/** Where the hero CTA and unit cards send a visitor to start (sign-up entry). */
export const SIGN_UP_HREF = "/signup";

/** The standalone WooCommerce toy shop — an external system, opened off-site. */
export const TOY_SHOP_URL = "https://shop.babymilestones.co.ke";

/** LCP budget for the hero on a 3G connection, in milliseconds (AC4). */
export const LCP_BUDGET_MS = 2000;

/** A single unit in the four-icon strip below the hero (AC2). */
export interface HomeUnit {
  readonly key: "play" | "talent" | "salon" | "shop";
  readonly label: string;
  /** Token icon name (not a glyph) — resolved by the renderer. */
  readonly icon: string;
  /** Destination URL. Internal app path, or an absolute off-site URL. */
  readonly href: string;
  /** True when `href` points to a separate system and must open off-site. */
  readonly external: boolean;
}

/** Hero block content (AC1): real child photo + headline + visible CTA. */
export interface HomeHero {
  readonly headline: string;
  readonly subhead: string;
  readonly cta: { readonly label: string; readonly href: string };
  readonly image: {
    /** Real photo of a real child — never an illustration/stock avatar. */
    readonly src: string;
    readonly alt: string;
  };
}

/** Hero content. The CTA label is fixed by AC1 ("Top up & book"). */
export const HOME_HERO: HomeHero = {
  headline: "Where every milestone is a moment to celebrate.",
  subhead:
    "Play, talent, salon and toy shop — one wallet, one tap. Top up and book in seconds.",
  cta: { label: "Top up & book", href: SIGN_UP_HREF },
  image: {
    src: "/home/hero-child.jpg",
    alt: "A smiling toddler at a Baby Milestones play session.",
  },
};

/**
 * The four units below the hero, in display order: Play / Talent / Salon /
 * Toy Shop (AC2). Toy Shop is the only external (WooCommerce) destination.
 */
export const HOME_UNITS: readonly HomeUnit[] = [
  { key: "play", label: "Play", icon: "play", href: SIGN_UP_HREF, external: false },
  { key: "talent", label: "Talent", icon: "talent", href: SIGN_UP_HREF, external: false },
  { key: "salon", label: "Salon", icon: "salon", href: SIGN_UP_HREF, external: false },
  { key: "shop", label: "Toy Shop", icon: "shop", href: TOY_SHOP_URL, external: true },
];

/** True when a unit points to a separate system and must open off-site. */
export function isExternalUnit(unit: HomeUnit): boolean {
  return unit.external;
}

/**
 * Anchor attributes for a unit link. External (WooCommerce) links open in a
 * new tab with `rel="noopener noreferrer"`; internal links carry neither.
 */
export function unitLinkAttrs(unit: HomeUnit): {
  href: string;
  target?: "_blank";
  rel?: string;
} {
  if (unit.external) {
    return { href: unit.href, target: "_blank", rel: "noopener noreferrer" };
  }
  return { href: unit.href };
}

/** True when a measured LCP (ms) meets the 3G budget (AC4). */
export function withinLcpBudget(lcpMs: number): boolean {
  return lcpMs <= LCP_BUDGET_MS;
}
