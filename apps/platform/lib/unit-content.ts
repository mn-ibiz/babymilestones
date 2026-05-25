/**
 * Per-unit marketing page content model (P1-E12-S02).
 *
 * Pure, framework-free description of each business unit's marketing page:
 * `/play`, `/talent`, `/salon`, `/events`, `/coaching` (AC1). Each page carries
 * a photo, short copy, a few examples, and a "Book now" CTA (AC2). All content
 * and routing/derivation logic lives here so it is unit-testable in isolation
 * (vitest, no DOM) and the `(public)/[unit]/page.tsx` server component stays a
 * thin render of these values.
 *
 * Content is sourced inline here for P1 (AC3); the shape is deliberately a
 * plain serialisable record so admin-editable DB rows can replace this map in
 * P5 polish WITHOUT any route changes — `getUnitPage(slug)` is the only seam.
 *
 * The Toy Shop is the standalone WooCommerce site (a separate system — POS
 * pulls orders + syncs stock, no SSO), so it is an EXTERNAL link only and has
 * NO `/shop` route in this app (AC1).
 */

import { SIGN_UP_HREF, TOY_SHOP_URL } from "./home-content";

export { SIGN_UP_HREF, TOY_SHOP_URL };

/** The booking funnel entry for an already-authenticated visitor. */
export const BOOKING_HREF = "/home";

/** Slugs of the five routable units, in display order (AC1). */
export const UNIT_SLUGS = [
  "play",
  "talent",
  "salon",
  "events",
  "coaching",
] as const;

export type UnitSlug = (typeof UNIT_SLUGS)[number];

/** A single per-unit marketing page (AC2). */
export interface UnitPage {
  readonly slug: UnitSlug;
  readonly title: string;
  /** Short marketing copy (one to two sentences). */
  readonly summary: string;
  readonly image: {
    /** Real photo — never an illustration/stock avatar. Under `/units/`. */
    readonly src: string;
    readonly alt: string;
  };
  /** A few concrete examples of what the unit offers. */
  readonly examples: readonly string[];
  /** "Book now" CTA. `href` is the unauthenticated entry (sign-up). */
  readonly cta: { readonly label: string; readonly href: string };
}

const CTA_LABEL = "Book now";

function page(
  slug: UnitSlug,
  title: string,
  summary: string,
  alt: string,
  examples: readonly string[],
): UnitPage {
  return {
    slug,
    title,
    summary,
    image: { src: `/units/${slug}.jpg`, alt },
    examples,
    cta: { label: CTA_LABEL, href: SIGN_UP_HREF },
  };
}

/** The five per-unit pages, in display order (AC1, AC2). */
export const UNIT_PAGES: readonly UnitPage[] = [
  page(
    "play",
    "Play",
    "Open, sensory-rich play sessions where little ones explore, move and make friends — booked by the hour with your wallet.",
    "Toddlers exploring the soft-play area at a Baby Milestones play session.",
    ["Soft-play & sensory zones", "Drop-in play hours", "Themed play mornings"],
  ),
  page(
    "talent",
    "Talent",
    "Discover what lights your child up — music, movement and creative classes led by specialist coaches.",
    "A child mid-dance at a Baby Milestones talent class.",
    ["Music & rhythm classes", "Dance & movement", "Art & messy play"],
  ),
  page(
    "salon",
    "Salon",
    "Gentle, child-friendly haircuts and first-cut moments — calm chairs, patient stylists, keepsake curls.",
    "A toddler getting a first haircut in the Baby Milestones salon chair.",
    ["First haircuts", "Trims & styles", "Keepsake curl moments"],
  ),
  page(
    "events",
    "Events",
    "Unforgettable birthdays and celebrations — book a party slot and let us handle the magic.",
    "Children celebrating at a Baby Milestones birthday party.",
    ["Birthday parties", "Seasonal celebrations", "Private group bookings"],
  ),
  page(
    "coaching",
    "Coaching",
    "One-to-one and small-group developmental coaching that meets your child exactly where they are.",
    "A coach working one-to-one with a child at Baby Milestones.",
    ["1:1 developmental coaching", "Small-group sessions", "Parent guidance"],
  ),
];

const PAGES_BY_SLUG: ReadonlyMap<string, UnitPage> = new Map(
  UNIT_PAGES.map((p) => [p.slug, p]),
);

/**
 * Resolve a route slug to its page content, or `undefined` for an unknown slug
 * (the route then renders a 404). The single seam a P5 DB-backed source would
 * swap in behind — callers never touch {@link UNIT_PAGES} directly.
 */
export function getUnitPage(slug: string): UnitPage | undefined {
  return PAGES_BY_SLUG.get(slug);
}

/**
 * Destination for the "Book now" CTA: the sign-up entry when unauthenticated
 * (AC2), otherwise straight into the in-app booking funnel.
 */
export function bookNowHref(isAuthenticated: boolean): string {
  return isAuthenticated ? BOOKING_HREF : SIGN_UP_HREF;
}

/**
 * The exact public marketing paths for the five units (`/play` … `/coaching`).
 * The edge middleware allow-list must equal this set; the test below pins that
 * contract so a new unit can never silently 404-redirect to login.
 */
export function unitPublicPaths(): string[] {
  return UNIT_SLUGS.map((slug) => `/${slug}`);
}

/** True for the external Toy Shop path, which must never be an internal route. */
export function isToyShopRoute(pathname: string): boolean {
  return pathname === "/shop";
}

/** Anchor attributes for the external (WooCommerce) Toy Shop link. */
export function toyShopLinkAttrs(): {
  href: string;
  target: "_blank";
  rel: string;
} {
  return { href: TOY_SHOP_URL, target: "_blank", rel: "noopener noreferrer" };
}
