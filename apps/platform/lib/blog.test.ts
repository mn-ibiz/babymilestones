import { describe, expect, it, vi } from "vitest";
import {
  renderArticleMarkdown,
  shareLinks,
  articleUrl,
  fetchPublishedArticles,
  fetchPublishedArticle,
  type PublicArticle,
  type PublicArticleSummary,
} from "./blog";

/**
 * P6-E06-S04 (Story 36.4) — Blog on the platform. The public list + per-article
 * detail render PUBLISHED parenting articles (AC3). The body is markdown rendered
 * to a SAFE HTML subset (no MDX dependency, no raw-HTML passthrough — XSS-safe).
 * Share buttons link to WhatsApp / X / Facebook by URL (no external SDK).
 */
describe("blog (P6-E06-S04 / Story 36.4)", () => {
  describe("renderArticleMarkdown — XSS-safe markdown subset", () => {
    it("renders headings, bold, italic, links and lists", () => {
      const html = renderArticleMarkdown(
        ["# Title", "", "Some **bold** and *italic* and a [link](https://safe.example).", "", "- one", "- two"].join(
          "\n",
        ),
      );
      expect(html).toContain("<h1>Title</h1>");
      expect(html).toContain("<strong>bold</strong>");
      expect(html).toContain("<em>italic</em>");
      expect(html).toContain('<a href="https://safe.example"');
      expect(html).toContain("<li>one</li>");
      expect(html).toContain("<ul>");
    });

    it("escapes raw HTML in the body (a <script> tag is NOT emitted)", () => {
      const html = renderArticleMarkdown("Hello <script>alert('xss')</script> world");
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes inline HTML so an img/onerror payload is inert (escaped, not a live tag)", () => {
      const html = renderArticleMarkdown('<img src=x onerror="alert(1)">');
      // The tag is escaped — no live <img element, so the onerror handler can't fire.
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;img");
      // The (escaped) quotes around the handler are entities, not real attribute quotes.
      expect(html).toContain("&quot;");
    });

    it("strips javascript: URLs from links (keeps the text, drops the href)", () => {
      const html = renderArticleMarkdown("[click](javascript:alert(1))");
      expect(html).not.toContain("javascript:");
      // The link text survives even though the unsafe scheme is dropped.
      expect(html).toContain("click");
    });

    it("does not emit raw markdown link syntax for an unsafe scheme", () => {
      const html = renderArticleMarkdown("[x](vbscript:msgbox(1))");
      expect(html).not.toContain("vbscript:");
    });

    it("adds rel=noopener + target=_blank to external links", () => {
      const html = renderArticleMarkdown("[ext](https://example.com)");
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('target="_blank"');
    });

    it("escapes HTML special chars in headings + text", () => {
      const html = renderArticleMarkdown("# A & B < C");
      expect(html).toContain("A &amp; B &lt; C");
    });
  });

  describe("articleUrl + shareLinks", () => {
    const article: PublicArticle = {
      slug: "weaning-101",
      title: "Weaning 101: First Foods",
      bodyMd: "Body.",
      coverImageUrl: null,
      tags: ["nutrition"],
      author: "Dr. Mary",
      publishedAt: "2026-05-01T00:00:00.000Z",
    };

    it("builds the canonical public article URL", () => {
      expect(articleUrl("weaning-101", "https://babymilestones.co.ke")).toBe(
        "https://babymilestones.co.ke/blog/weaning-101",
      );
    });

    it("builds WhatsApp / X / Facebook share links by URL (no SDK)", () => {
      const links = shareLinks(article, "https://babymilestones.co.ke");
      const url = "https://babymilestones.co.ke/blog/weaning-101";
      const encUrl = encodeURIComponent(url);
      const encTitle = encodeURIComponent("Weaning 101: First Foods");

      const whatsapp = links.find((l) => l.network === "whatsapp")!;
      expect(whatsapp.href).toBe(`https://wa.me/?text=${encodeURIComponent(`Weaning 101: First Foods ${url}`)}`);

      const x = links.find((l) => l.network === "x")!;
      expect(x.href).toBe(`https://twitter.com/intent/tweet?url=${encUrl}&text=${encTitle}`);

      const facebook = links.find((l) => l.network === "facebook")!;
      expect(facebook.href).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encUrl}`);

      // Every share link opens in a new tab safely.
      for (const l of links) {
        expect(l.rel).toBe("noopener noreferrer");
        expect(l.label.length).toBeGreaterThan(0);
      }
    });
  });

  describe("fetch helpers — graceful, never throw", () => {
    const summary: PublicArticleSummary = {
      slug: "weaning-101",
      title: "Weaning 101",
      coverImageUrl: null,
      tags: ["nutrition"],
      author: "Dr. Mary",
      publishedAt: "2026-05-01T00:00:00.000Z",
    };

    it("fetchPublishedArticles returns the list on a 200", async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ articles: [summary] }),
      }) as unknown as typeof fetch;
      const list = await fetchPublishedArticles({ fetchImpl, apiBaseUrl: "http://api" });
      expect(list).toHaveLength(1);
      expect(fetchImpl).toHaveBeenCalledWith("http://api/public/articles");
    });

    it("fetchPublishedArticles passes the tag filter", async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ articles: [] }),
      }) as unknown as typeof fetch;
      await fetchPublishedArticles({ fetchImpl, apiBaseUrl: "http://api", tag: "sleep" });
      expect(fetchImpl).toHaveBeenCalledWith("http://api/public/articles?tag=sleep");
    });

    it("fetchPublishedArticles returns [] on error (never crashes the page)", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error("boom")) as unknown as typeof fetch;
      expect(await fetchPublishedArticles({ fetchImpl })).toEqual([]);
    });

    it("fetchPublishedArticle returns the article on a 200", async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ article: { ...summary, bodyMd: "Body." } }),
      }) as unknown as typeof fetch;
      const a = await fetchPublishedArticle("weaning-101", { fetchImpl, apiBaseUrl: "http://api" });
      expect(a?.bodyMd).toBe("Body.");
      expect(fetchImpl).toHaveBeenCalledWith("http://api/public/articles/weaning-101");
    });

    it("fetchPublishedArticle returns null on a 404", async () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
      expect(await fetchPublishedArticle("missing", { fetchImpl })).toBeNull();
    });
  });
});
