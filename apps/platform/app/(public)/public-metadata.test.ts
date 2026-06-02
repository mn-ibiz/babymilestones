import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { metadata as blogIndexMetadata } from "./blog/page";
import { generateMetadata as articleMetadata } from "./blog/[slug]/page";
import { metadata as homeMetadata } from "./page";
import { generateMetadata as unitMetadata } from "./[unit]/page";

/**
 * Story 36.2 AC2 — every PUBLIC page carries canonical + Open Graph + Twitter.
 * These exercise the ACTUAL exported `metadata` / `generateMetadata` of each
 * public surface (the same objects Next renders), proving the SEO is wired into
 * the pages — not just that the helper works in isolation.
 *
 * The async page metadata functions fetch CMS / article content through the
 * default `fetch`. We stub `global.fetch` per test so the result is deterministic
 * and never touches the network: a non-2xx CMS response falls back to the static
 * unit content; a non-2xx article response → not-found → empty metadata.
 */

const originalFetch = global.fetch;
const respond = (ok: boolean, body: unknown) =>
  vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("home page metadata (AC2)", () => {
  it("has a canonical home URL and full OG + Twitter", () => {
    expect(homeMetadata.alternates?.canonical).toBe("https://babymilestones.co.ke");
    expect(homeMetadata.openGraph?.url).toBe("https://babymilestones.co.ke");
    expect(homeMetadata.openGraph?.siteName).toBe("Baby Milestones");
    expect((homeMetadata.openGraph as Record<string, unknown>).type).toBe("website");
    expect((homeMetadata.twitter as Record<string, unknown>).card).toBe("summary_large_image");
    expect(homeMetadata.openGraph?.images).toBeDefined();
  });
});

describe("blog index metadata (AC2)", () => {
  it("has a /blog canonical and full OG + Twitter", () => {
    expect(blogIndexMetadata.alternates?.canonical).toBe("https://babymilestones.co.ke/blog");
    expect(blogIndexMetadata.openGraph?.url).toBe("https://babymilestones.co.ke/blog");
    expect((blogIndexMetadata.openGraph as Record<string, unknown>).type).toBe("website");
    expect((blogIndexMetadata.twitter as Record<string, unknown>).card).toBe(
      "summary_large_image",
    );
  });
});

describe("per-unit generateMetadata (AC2)", () => {
  beforeEach(() => {
    // CMS lookup returns non-2xx → the page falls back to static unit content.
    global.fetch = respond(false, {});
  });

  it("builds canonical + OG + Twitter for a known unit", async () => {
    const meta = await unitMetadata({ params: Promise.resolve({ unit: "play" }) });
    expect(meta.alternates?.canonical).toBe("https://babymilestones.co.ke/play");
    expect(meta.openGraph?.url).toBe("https://babymilestones.co.ke/play");
    expect((meta.openGraph as Record<string, unknown>).type).toBe("website");
    expect(meta.openGraph?.siteName).toBe("Baby Milestones");
    expect((meta.twitter as Record<string, unknown>).card).toBe("summary_large_image");
    expect(meta.title).toContain("Play");
  });

  it("returns empty metadata for an unknown unit (the page 404s)", async () => {
    const meta = await unitMetadata({ params: Promise.resolve({ unit: "does-not-exist" }) });
    expect(meta).toEqual({});
  });
});

describe("blog detail generateMetadata (AC2)", () => {
  it("builds an article-typed canonical + OG with the cover image", async () => {
    global.fetch = respond(true, {
      article: {
        slug: "weaning-101",
        title: "Weaning 101",
        bodyMd: "How to wean your little one gently and safely over the first months.",
        coverImageUrl: "https://cdn.example.com/cover.jpg",
        tags: ["nutrition"],
        author: "Dr Amina",
        publishedAt: "2026-01-02T00:00:00.000Z",
      },
    });
    const meta = await articleMetadata({ params: Promise.resolve({ slug: "weaning-101" }) });
    expect(meta.alternates?.canonical).toBe("https://babymilestones.co.ke/blog/weaning-101");
    expect(meta.openGraph?.url).toBe("https://babymilestones.co.ke/blog/weaning-101");
    expect((meta.openGraph as Record<string, unknown>).type).toBe("article");
    expect(meta.openGraph?.images).toEqual([{ url: "https://cdn.example.com/cover.jpg" }]);
    expect((meta.twitter as Record<string, unknown>).card).toBe("summary_large_image");
    expect(meta.title).toBe("Weaning 101 — Baby Milestones");
  });

  it("returns empty metadata for a missing/draft slug (the page 404s)", async () => {
    global.fetch = respond(false, {});
    const meta = await articleMetadata({ params: Promise.resolve({ slug: "missing" }) });
    expect(meta).toEqual({});
  });
});
