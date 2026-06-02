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

/**
 * LCP budget for the hero on a 3G-fast connection, in milliseconds.
 *
 * Tightened from 2000 → 1500 for Story 36.2 AC3 ("LCP < 1.5s on 3G fast"). This
 * is the controllable budget *constant*; the actual sub-1.5s measurement is a
 * CI/manual Lighthouse gate (not a vitest assertion). The page-side perf wins
 * that keep us under it: the hero uses `next/image` with `priority` + explicit
 * width/height (eager fetch, no CLS), and the public pages avoid heavy client
 * imports so the marketing surface stays SSR-light.
 */
export const LCP_BUDGET_MS = 1500;

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

/* ----------------------------------------- testimonials (P6-E04-S04 / 34.4) */

/**
 * A render-ready testimonial card on the home page (Story 34.4 AC2). A curated
 * 5-star quote shown under an ANONYMISED attribution (e.g. "Parent of two,
 * Nairobi") — NEVER a real parent name. Sourced from the public review-snippets
 * endpoint, which already strips all PII; this is purely the home-page shape.
 */
export interface HomeTestimonial {
  /** The snippet's public id (a stable React key — not a parent/feedback id). */
  readonly id: string;
  /** The curated quote. */
  readonly quote: string;
  /** The anonymised attribution. */
  readonly attribution: string;
}

/** The public review-snippet shape returned by `/public/review-snippets`. */
export interface PublicReviewSnippet {
  id: string;
  quote: string;
  attributionLabel: string;
}

/** Section heading shown above the testimonials strip. */
export const TESTIMONIALS_HEADING = "What parents say";

/**
 * The home page auto-pulls exactly the LATEST 3 published testimonials (Story 36.5
 * AC1): a tight three-card social-proof strip. The public endpoint already caps to 3
 * by publish recency; this constant + the cap in {@link homeTestimonials} make the
 * guarantee explicit and defensive even if the feed ever returns more.
 */
export const HOME_TESTIMONIALS_LIMIT = 3;

/**
 * Shape the public snippets into home-page testimonial cards (AC2 / Story 36.5 AC1).
 * Drops any snippet missing a quote or attribution defensively, trims whitespace, and
 * caps the result to the LATEST {@link HOME_TESTIMONIALS_LIMIT} (3) — the feed already
 * arrives publish-recency-DESC, so source order is preserved. Pure so the home-page
 * server component stays a thin render and this is unit-tested in isolation. Carries
 * ONLY the public fields — never a parent identity.
 */
export function homeTestimonials(snippets: readonly PublicReviewSnippet[]): HomeTestimonial[] {
  return snippets
    .filter((s) => s.quote.trim().length > 0 && s.attributionLabel.trim().length > 0)
    .slice(0, HOME_TESTIMONIALS_LIMIT)
    .map((s) => ({ id: s.id, quote: s.quote.trim(), attribution: s.attributionLabel.trim() }));
}

/**
 * Fetch the published testimonials for the home page (AC2). Server-side fetch
 * against the public, cached review-snippets endpoint. Resolves to an EMPTY list on
 * any failure (network/parse/non-2xx) so a marketing home page never crashes just
 * because the testimonials feed is unavailable. `fetchImpl` + `apiBaseUrl` are
 * injectable for deterministic tests.
 */
export async function fetchHomeTestimonials(opts: {
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
} = {}): Promise<HomeTestimonial[]> {
  const base = opts.apiBaseUrl ?? process.env.API_BASE_URL ?? "http://127.0.0.1:8080";
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${base}/public/review-snippets`);
    if (!res.ok) return [];
    const json = (await res.json()) as { snippets?: PublicReviewSnippet[] };
    return homeTestimonials(json.snippets ?? []);
  } catch {
    return [];
  }
}
