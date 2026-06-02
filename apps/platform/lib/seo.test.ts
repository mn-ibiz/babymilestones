import { describe, expect, it } from "vitest";
import {
  OG_DEFAULT_IMAGE,
  SITE_NAME,
  SITE_URL,
  TWITTER_HANDLE,
  articleJsonLd,
  buildMetadata,
  canonicalUrl,
  localBusinessJsonLd,
  serializeJsonLd,
} from "./seo";

describe("site constants (AC2)", () => {
  it("uses the public production origin with no trailing slash", () => {
    expect(SITE_URL).toBe("https://babymilestones.co.ke");
    expect(SITE_URL.endsWith("/")).toBe(false);
  });

  it("brands the site as Baby Milestones", () => {
    expect(SITE_NAME).toBe("Baby Milestones");
  });

  it("ships a default Open Graph share image", () => {
    expect(OG_DEFAULT_IMAGE.startsWith("/")).toBe(true);
  });
});

describe("canonicalUrl", () => {
  it("joins the site origin and an absolute path", () => {
    expect(canonicalUrl("/blog")).toBe("https://babymilestones.co.ke/blog");
  });

  it("returns the bare origin for the home path", () => {
    expect(canonicalUrl("/")).toBe("https://babymilestones.co.ke");
  });

  it("normalises a missing leading slash", () => {
    expect(canonicalUrl("play")).toBe("https://babymilestones.co.ke/play");
  });

  it("strips a trailing slash (other than root)", () => {
    expect(canonicalUrl("/blog/")).toBe("https://babymilestones.co.ke/blog");
  });
});

describe("buildMetadata (AC2 — meta + OG + Twitter + canonical)", () => {
  const meta = buildMetadata({
    title: "Play",
    description: "Sensory-rich play sessions.",
    path: "/play",
  });

  it("sets the page title and description", () => {
    expect(meta.title).toBe("Play");
    expect(meta.description).toBe("Sensory-rich play sessions.");
  });

  it("sets metadataBase to the site origin", () => {
    expect(meta.metadataBase?.toString()).toBe("https://babymilestones.co.ke/");
  });

  it("sets the canonical URL from the path", () => {
    expect(meta.alternates?.canonical).toBe("https://babymilestones.co.ke/play");
  });

  it("fills Open Graph with title/description/url/type/siteName/image", () => {
    // Next's OpenGraph/Twitter are discriminated unions; read as a record so the
    // discriminated fields (type/card) are accessible in the assertion.
    const og = meta.openGraph! as Record<string, unknown>;
    expect(og.title).toBe("Play");
    expect(og.description).toBe("Sensory-rich play sessions.");
    expect(og.url).toBe("https://babymilestones.co.ke/play");
    expect(og.type).toBe("website");
    expect(og.siteName).toBe(SITE_NAME);
    expect(og.images).toEqual([{ url: OG_DEFAULT_IMAGE }]);
  });

  it("fills a Twitter summary_large_image card", () => {
    const tw = meta.twitter! as Record<string, unknown>;
    expect(tw.card).toBe("summary_large_image");
    expect(tw.title).toBe("Play");
    expect(tw.description).toBe("Sensory-rich play sessions.");
    expect(tw.images).toEqual([OG_DEFAULT_IMAGE]);
    expect(tw.site).toBe(TWITTER_HANDLE);
  });

  it("uses a supplied image over the default for OG and Twitter", () => {
    const m = buildMetadata({
      title: "Weaning 101",
      description: "How to wean.",
      path: "/blog/weaning-101",
      image: "https://cdn.example.com/cover.jpg",
    });
    expect(m.openGraph?.images).toEqual([{ url: "https://cdn.example.com/cover.jpg" }]);
    expect(m.twitter?.images).toEqual(["https://cdn.example.com/cover.jpg"]);
  });

  it("honours an explicit OG type (e.g. article)", () => {
    const m = buildMetadata({
      title: "Weaning 101",
      description: "How to wean.",
      path: "/blog/weaning-101",
      type: "article",
    });
    expect((m.openGraph as Record<string, unknown>).type).toBe("article");
  });

  it("defaults the OG type to website", () => {
    expect((meta.openGraph as Record<string, unknown>).type).toBe("website");
  });
});

describe("localBusinessJsonLd (AC2 — structured data)", () => {
  const ld = localBusinessJsonLd();

  it("declares the LocalBusiness schema.org type", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("LocalBusiness");
  });

  it("carries the business name and canonical url", () => {
    expect(ld.name).toBe(SITE_NAME);
    expect(ld.url).toBe(SITE_URL);
  });

  it("carries a Nairobi, Kenya postal address", () => {
    expect(ld.address["@type"]).toBe("PostalAddress");
    expect(ld.address.addressLocality).toBe("Nairobi");
    expect(ld.address.addressCountry).toBe("KE");
  });

  it("lists the public-facing units as an offer catalog", () => {
    expect(Array.isArray(ld.makesOffer)).toBe(true);
    expect(ld.makesOffer.length).toBeGreaterThanOrEqual(4);
    const names = ld.makesOffer.map((o) => o.itemOffered.name);
    expect(names).toEqual(expect.arrayContaining(["Play", "Talent", "Salon"]));
  });

  it("exposes a logo and an absolute image", () => {
    expect(ld.logo.startsWith("https://")).toBe(true);
    expect(ld.image.startsWith("https://")).toBe(true);
  });
});

describe("serializeJsonLd (AC2 — safe inline script body)", () => {
  it("round-trips a JSON-LD object back to its original value", () => {
    const ld = localBusinessJsonLd();
    expect(JSON.parse(serializeJsonLd(ld))).toEqual(ld);
  });

  it("escapes < so a string field can never close the script element", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});

describe("articleJsonLd (AC2 — Article structured data on blog detail)", () => {
  const ld = articleJsonLd({
    slug: "weaning-101",
    title: "Weaning 101",
    author: "Dr Amina",
    coverImageUrl: "https://cdn.example.com/cover.jpg",
    publishedAt: "2026-01-02T00:00:00.000Z",
  });

  it("declares the Article schema.org type", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Article");
  });

  it("carries the headline, author, image and canonical url", () => {
    expect(ld.headline).toBe("Weaning 101");
    expect(ld.author).toEqual({ "@type": "Person", name: "Dr Amina" });
    expect(ld.image).toEqual(["https://cdn.example.com/cover.jpg"]);
    expect(ld.url).toBe("https://babymilestones.co.ke/blog/weaning-101");
    expect(ld.datePublished).toBe("2026-01-02T00:00:00.000Z");
  });

  it("names the publisher as the site organisation", () => {
    expect(ld.publisher["@type"]).toBe("Organization");
    expect(ld.publisher.name).toBe(SITE_NAME);
  });

  it("omits the image array when there is no cover", () => {
    const noCover = articleJsonLd({
      slug: "no-cover",
      title: "No Cover",
      author: "Anon",
      coverImageUrl: null,
      publishedAt: null,
    });
    expect(noCover.image).toBeUndefined();
    expect(noCover.datePublished).toBeUndefined();
  });
});
