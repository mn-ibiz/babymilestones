/**
 * P5-E06-S02 (Story 36.2) — SEO metadata + structured data for the public site.
 *
 * One pure, framework-free helper module that every public marketing surface
 * (home, per-unit, blog index, blog detail) uses to emit consistent, correct
 * SEO. Keeping it here means the metadata + JSON-LD shapes are unit-testable in
 * isolation (vitest, no DOM) and each page's `generateMetadata`/render stays a
 * thin call into these builders.
 *
 * What this covers (AC2 — "all public pages: meta tags, Open Graph, structured
 * data"):
 *   - {@link buildMetadata}: the Next.js `Metadata` object — `<title>`,
 *     description, `metadataBase`, the canonical `<link>`, the full Open Graph
 *     block (title/description/url/type/site_name/image) and the Twitter
 *     summary-large-image card.
 *   - {@link localBusinessJsonLd}: the site-wide `LocalBusiness` JSON-LD,
 *     injected once in the public layout so it appears on every public page.
 *   - {@link articleJsonLd}: per-article `Article` JSON-LD for blog detail pages.
 *
 * Lighthouse 95+ (AC1) and LCP < 1.5s on 3G (AC3) are NOT unit-tested here — they
 * are CI/manual Lighthouse gates. This module implements the controllable SEO
 * surface; the LCP *budget constant* lives in `home-content.ts` (tightened to
 * 1500ms) and the perf wins (priority hero `next/image`, explicit width/height to
 * avoid CLS, no heavy client imports on public pages) are applied in the pages.
 *
 * CONFIG FLAG: the postal address below is a sensible Nairobi/Kenya placeholder.
 * Replace `BUSINESS_ADDRESS` / `BUSINESS_PHONE` with the real registered details
 * before launch — flagged here rather than invented precisely.
 */

import type { Metadata } from "next";

/** The public production origin for canonical + Open Graph URLs (no trailing slash). */
export const SITE_URL = "https://babymilestones.co.ke";

/** The brand name used in titles, OG `site_name`, and the LocalBusiness `name`. */
export const SITE_NAME = "Baby Milestones";

/** A one-line brand description used as the default meta/OG description. */
export const SITE_DESCRIPTION =
  "Play, talent, salon and toy shop for your little one — one wallet, one tap. Top up and book in seconds.";

/** Default Open Graph / Twitter share image (a static asset under `/`). */
export const OG_DEFAULT_IMAGE = "/og/baby-milestones.png";

/** Brand logo (absolute) for the LocalBusiness JSON-LD. */
export const SITE_LOGO = `${SITE_URL}/icons/logo.png`;

/** The brand's Twitter/X handle for the Twitter card `site` tag. */
export const TWITTER_HANDLE = "@babymilestones";

/**
 * CONFIG FLAG — placeholder registered address. Replace with the real one before
 * launch. Nairobi, Kenya is correct; the street line is a stand-in.
 */
export const BUSINESS_ADDRESS = {
  "@type": "PostalAddress" as const,
  streetAddress: "Baby Milestones Centre",
  addressLocality: "Nairobi",
  addressRegion: "Nairobi",
  postalCode: "00100",
  addressCountry: "KE",
};

/** CONFIG FLAG — placeholder contact number. Replace with the real line before launch. */
export const BUSINESS_PHONE = "+254700000000";

/** Join the site origin with an absolute path → a canonical URL (no trailing slash). */
export function canonicalUrl(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "" || trimmed === "/") return SITE_URL;
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const noTrailing = withSlash.replace(/\/+$/u, "");
  return `${SITE_URL}${noTrailing === "" ? "" : noTrailing}`;
}

/** Inputs to {@link buildMetadata}. `image`/`type` default to the brand image + "website". */
export interface BuildMetadataInput {
  title: string;
  description: string;
  /** Absolute path the page lives at (e.g. "/play", "/blog/weaning-101"). */
  path: string;
  /** Override the default OG/Twitter image (e.g. an article cover). */
  image?: string;
  /** Open Graph object type. "website" for marketing pages, "article" for blog detail. */
  type?: "website" | "article";
}

/**
 * Build the Next.js `Metadata` for a public page (AC2). Produces the title,
 * description, `metadataBase`, the canonical link, the full Open Graph block and
 * a Twitter summary-large-image card — all derived from the page's own
 * title/description/path so every public surface is consistent by construction.
 */
export function buildMetadata(input: BuildMetadataInput): Metadata {
  const { title, description, path } = input;
  const url = canonicalUrl(path);
  const image = input.image ?? OG_DEFAULT_IMAGE;
  const type = input.type ?? "website";
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type,
      siteName: SITE_NAME,
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
      site: TWITTER_HANDLE,
    },
  };
}

/** The public-facing units advertised in the LocalBusiness offer catalog. */
const OFFERED_SERVICES = [
  { name: "Play", description: "Open, sensory-rich play sessions for little ones." },
  { name: "Talent", description: "Music, movement and creative classes for children." },
  { name: "Salon", description: "Gentle, child-friendly haircuts and first-cut moments." },
  { name: "Events", description: "Birthdays and celebrations booked by the slot." },
  { name: "Coaching", description: "One-to-one and small-group developmental coaching." },
] as const;

/** The shape of the LocalBusiness JSON-LD (a serialisable schema.org object). */
export interface LocalBusinessJsonLd {
  "@context": "https://schema.org";
  "@type": "LocalBusiness";
  name: string;
  description: string;
  url: string;
  logo: string;
  image: string;
  telephone: string;
  address: typeof BUSINESS_ADDRESS;
  areaServed: string;
  makesOffer: {
    "@type": "Offer";
    itemOffered: { "@type": "Service"; name: string; description: string };
  }[];
}

/**
 * The site-wide `LocalBusiness` structured data (AC2). Injected ONCE in the public
 * layout as a `<script type="application/ld+json">`, so it appears on every public
 * page. Built from the brand constants + the public unit catalog above.
 */
export function localBusinessJsonLd(): LocalBusinessJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    logo: SITE_LOGO,
    image: `${SITE_URL}${OG_DEFAULT_IMAGE}`,
    telephone: BUSINESS_PHONE,
    address: BUSINESS_ADDRESS,
    areaServed: "Nairobi, Kenya",
    makesOffer: OFFERED_SERVICES.map((s) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: s.name, description: s.description },
    })),
  };
}

/**
 * Serialise a JSON-LD object for inlining in a `<script type="application/ld+json">`.
 * Escapes `<` to `<` so no string field (e.g. an article title) can open a
 * `</script>` and break out of the element — the standard safe inline-JSON pattern.
 * Pure, so it's unit-tested directly; the `<JsonLd>` component is a thin wrapper.
 */
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</gu, "\\u003c");
}

/** Inputs to {@link articleJsonLd} — the public fields of a published article. */
export interface ArticleJsonLdInput {
  slug: string;
  title: string;
  author: string;
  coverImageUrl: string | null;
  publishedAt: string | null;
}

/** The shape of the Article JSON-LD for a blog detail page. */
export interface ArticleJsonLd {
  "@context": "https://schema.org";
  "@type": "Article";
  headline: string;
  url: string;
  author: { "@type": "Person"; name: string };
  publisher: { "@type": "Organization"; name: string; logo: { "@type": "ImageObject"; url: string } };
  image?: string[];
  datePublished?: string;
}

/**
 * Per-article `Article` structured data (AC2) for a blog detail page. The image
 * array and `datePublished` are OMITTED when the article has no cover / no publish
 * date, so the emitted JSON-LD never carries null fields.
 */
export function articleJsonLd(input: ArticleJsonLdInput): ArticleJsonLd {
  const ld: ArticleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    url: canonicalUrl(`/blog/${input.slug}`),
    author: { "@type": "Person", name: input.author },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: SITE_LOGO },
    },
  };
  if (input.coverImageUrl) ld.image = [input.coverImageUrl];
  if (input.publishedAt) ld.datePublished = input.publishedAt;
  return ld;
}
