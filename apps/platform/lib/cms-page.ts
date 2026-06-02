import { getUnitPage } from "./unit-content";

/**
 * P6-E06-S03 (Story 36.3) — CMS-driven unit pages (platform side).
 *
 * The per-unit public page ((public)/[unit]/page.tsx) renders admin-edited CMS
 * content when a PUBLISHED page exists for the slug, and falls back to the existing
 * static {@link getUnitPage} content otherwise — so a unit with no CMS row behaves
 * exactly as before (no behaviour change). The single seam is
 * {@link resolveUnitPageView}: it merges an optional published CMS page over the
 * static model into one render-ready view-model.
 *
 * Drafts are NEVER fetched here — the public endpoint returns published content only
 * (an in-progress draft edit keeps serving the last published content). The admin
 * preview path is gated behind `manage config` in the admin app, not this surface.
 */

/** One ordered body section as published by the CMS. */
export interface PublishedCmsSection {
  heading: string;
  body: string;
}

/** The PUBLISHED CMS content for a slug, as returned by `/public/cms-pages/:slug`. */
export interface PublishedCmsPage {
  slug: string;
  heroCopy: string;
  heroImageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  bodySections: PublishedCmsSection[];
}

/** A render-ready section (heading + optional body). */
export interface UnitPageSection {
  heading: string;
  /** Body text/markdown; empty for a static example (which is heading-only). */
  body: string;
}

/**
 * The unified per-unit page render view-model. Whether the content came from the
 * CMS (`source: "cms"`) or the static fallback (`source: "static"`), the page
 * component renders the same fields.
 */
export interface UnitPageView {
  slug: string;
  /** Page title — the CMS has no separate title, so it reuses the static one. */
  title: string;
  heroCopy: string;
  heroImageSrc: string;
  heroImageAlt: string;
  cta: { label: string; href: string };
  /** The body sections (CMS) or the static examples mapped to heading-only sections. */
  sections: UnitPageSection[];
  source: "cms" | "static";
}

/**
 * Merge an optional published CMS page over the static unit content into one
 * render-ready view-model. When `cms` is present its content wins (AC1 — the CMS
 * OPTIONALLY overrides the static page). When `cms` is null we fall back to the
 * static {@link getUnitPage}; if THAT is also absent (unknown slug) the result is
 * null and the route 404s — UNLESS the CMS supplied a slug the static set doesn't
 * know (e.g. `shop`), in which case the CMS content alone renders the page.
 */
export function resolveUnitPageView(slug: string, cms: PublishedCmsPage | null): UnitPageView | null {
  const staticPage = getUnitPage(slug);

  if (cms) {
    return {
      slug,
      title: staticPage?.title ?? titleFromSlug(slug),
      heroCopy: cms.heroCopy,
      heroImageSrc: cms.heroImageUrl || staticPage?.image.src || "",
      heroImageAlt: staticPage?.image.alt ?? `${titleFromSlug(slug)} at Baby Milestones`,
      cta: { label: cms.ctaLabel, href: cms.ctaHref },
      sections: cms.bodySections.map((s) => ({ heading: s.heading, body: s.body })),
      source: "cms",
    };
  }

  if (!staticPage) return null;

  return {
    slug: staticPage.slug,
    title: staticPage.title,
    heroCopy: staticPage.summary,
    heroImageSrc: staticPage.image.src,
    heroImageAlt: staticPage.image.alt,
    cta: { label: staticPage.cta.label, href: staticPage.cta.href },
    // The static "examples" become heading-only sections so both sources render the same.
    sections: staticPage.examples.map((heading) => ({ heading, body: "" })),
    source: "static",
  };
}

/** Title-case a slug as a last-resort page title (CMS-only slugs, e.g. "shop"). */
function titleFromSlug(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * Fetch the PUBLISHED CMS page for a slug (server-side). Resolves to null on a 404
 * (no override → render the static page) AND on any failure (network/parse/non-2xx)
 * so a marketing page never crashes just because the CMS feed is unavailable.
 * `fetchImpl` + `apiBaseUrl` are injectable for deterministic tests.
 */
export async function fetchPublishedUnitPage(
  slug: string,
  opts: { apiBaseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<PublishedCmsPage | null> {
  const base = opts.apiBaseUrl ?? process.env.API_BASE_URL ?? "http://127.0.0.1:8080";
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${base}/public/cms-pages/${slug}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { page?: PublishedCmsPage };
    return json.page ?? null;
  } catch {
    return null;
  }
}
