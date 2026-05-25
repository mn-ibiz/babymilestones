import {
  parseUtmParams,
  serializeAcquisitionSource,
  type AcquisitionSource,
} from "@bm/contracts";
import { SIGN_UP_HREF, UNIT_SLUGS, type UnitSlug } from "./unit-content";

/**
 * WhatsApp deep-link routing logic (P1-E12-S03).
 *
 * A WhatsApp ad links to `/book/[unit]?utm_*`. This pure module resolves that
 * request into: (1) whether the unit is bookable (else 404), (2) the captured
 * UTM acquisition source, (3) the cookie value carrying it through the signup
 * funnel, and (4) the redirect target — the signup entry with the pre-selected
 * unit so the post-signup booking funnel (S04) resumes on the right unit (AC1).
 *
 * All routing/derivation lives here so the `(public)/book/[unit]/page.tsx`
 * server component stays a thin render and the logic is unit-testable without a
 * Next request object.
 */

/** Cookie that carries the captured acquisition source through the funnel. */
export const ACQUISITION_COOKIE_NAME = "bm_acq";
/** 30 days — long enough to survive a delayed signup, short enough to be fresh. */
export const ACQUISITION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** True when `slug` is one of the five bookable units (never `/shop`, AC1). */
export function isBookableUnit(slug: string): slug is UnitSlug {
  return (UNIT_SLUGS as readonly string[]).includes(slug);
}

export interface DeepLinkResolution {
  /** True when the unit slug is unknown → the route renders a 404. */
  notFound: boolean;
  /** The resolved unit (null when notFound). */
  unit: UnitSlug | null;
  /** The captured acquisition source, or null for an organic (no-UTM) link. */
  acquisition: AcquisitionSource | null;
  /** JSON cookie value to persist the acquisition, or null when none. */
  acquisitionCookieValue: string | null;
  /** Where to send the visitor: the signup entry with the pre-selected unit. */
  redirectTo: string;
}

/**
 * Resolve a `/book/[unit]?utm_*` deep-link into its routing decision (AC1).
 * Pre-selects the unit, captures UTM, and points the CTA at signup with the
 * unit carried so the funnel resumes there post-signup.
 */
export function resolveDeepLink(
  unitParam: string,
  query: Record<string, string | string[] | undefined>,
): DeepLinkResolution {
  if (!isBookableUnit(unitParam)) {
    return {
      notFound: true,
      unit: null,
      acquisition: null,
      acquisitionCookieValue: null,
      redirectTo: SIGN_UP_HREF,
    };
  }
  const acquisition = parseUtmParams(query);
  return {
    notFound: false,
    unit: unitParam,
    acquisition,
    acquisitionCookieValue: serializeAcquisitionSource(acquisition),
    redirectTo: `${SIGN_UP_HREF}?unit=${unitParam}`,
  };
}
