import { describe, expect, it, vi, afterEach } from "vitest";
import {
  ARTICLE_STATUS_OPTIONS,
  emptyArticleForm,
  articleToForm,
  formToSave,
  parseTagsInput,
  tagsToInput,
  fetchArticles,
  fetchArticle,
  createArticle,
  updateArticle,
  publishArticle,
  unpublishArticle,
  type Article,
  type ArticleForm,
} from "./articles";

/**
 * P6-E06-S04 (Story 36.4) — admin Blog / Articles client logic. Framework-free
 * view-model shaping (pure) + thin API wrappers (driven through a stubbed fetch).
 */
describe("articles admin lib (P6-E06-S04 / Story 36.4)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const article: Article = {
    id: "a1",
    slug: "weaning-101",
    title: "Weaning 101",
    bodyMd: "# Hello",
    coverImageUrl: "https://cdn/x.jpg",
    tags: ["nutrition", "0-1y"],
    author: "Dr. Mary",
    status: "draft",
    publishedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };

  it("offers the draft + published status filter options", () => {
    expect(ARTICLE_STATUS_OPTIONS.map((o) => o.value)).toEqual(["all", "draft", "published"]);
  });

  it("emptyArticleForm seeds a blank form", () => {
    const f = emptyArticleForm();
    expect(f.slug).toBe("");
    expect(f.tagsInput).toBe("");
    expect(f.bodyMd).toBe("");
  });

  it("articleToForm maps a DTO into editable form state (tags joined)", () => {
    const f = articleToForm(article);
    expect(f.slug).toBe("weaning-101");
    expect(f.tagsInput).toBe("nutrition, 0-1y");
    expect(f.coverImageUrl).toBe("https://cdn/x.jpg");
  });

  it("parseTagsInput splits + trims + drops blanks", () => {
    expect(parseTagsInput(" nutrition ,, 0-1y , ")).toEqual(["nutrition", "0-1y"]);
    expect(parseTagsInput("")).toEqual([]);
  });

  it("tagsToInput joins with comma+space", () => {
    expect(tagsToInput(["a", "b"])).toBe("a, b");
  });

  it("formToSave produces the save payload (tags parsed, blank cover → null)", () => {
    const f: ArticleForm = {
      slug: "weaning-101",
      title: "Weaning 101",
      bodyMd: "Body.",
      coverImageUrl: "  ",
      tagsInput: "nutrition, sleep",
      author: "Dr. Mary",
    };
    const payload = formToSave(f);
    expect(payload).toEqual({
      slug: "weaning-101",
      title: "Weaning 101",
      bodyMd: "Body.",
      coverImageUrl: null,
      tags: ["nutrition", "sleep"],
      author: "Dr. Mary",
    });
  });

  describe("API wrappers", () => {
    function stub(handler: (url: string, init?: { method?: string }) => unknown): void {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: { method?: string }) => {
          const body = handler(url, init);
          return { ok: true, status: 200, json: async () => body } as unknown as Response;
        }),
      );
    }

    it("fetchArticles GETs the list", async () => {
      stub(() => ({ articles: [article] }));
      const r = await fetchArticles();
      expect(r.articles[0]!.slug).toBe("weaning-101");
    });

    it("fetchArticle GETs by id", async () => {
      const seen: string[] = [];
      stub((url) => {
        seen.push(url);
        return { article };
      });
      await fetchArticle("a1");
      expect(seen[0]).toContain("/admin/articles/a1");
    });

    it("createArticle POSTs the payload", async () => {
      const seen: { url: string; method?: string }[] = [];
      stub((url, init) => {
        seen.push({ url, method: init?.method });
        return { article };
      });
      await createArticle(formToSave(articleToForm(article)));
      expect(seen[0]!.url).toContain("/admin/articles");
      expect(seen[0]!.method).toBe("POST");
    });

    it("updateArticle PATCHes by id", async () => {
      const seen: { url: string; method?: string }[] = [];
      stub((url, init) => {
        seen.push({ url, method: init?.method });
        return { article };
      });
      await updateArticle("a1", formToSave(articleToForm(article)));
      expect(seen[0]!.url).toContain("/admin/articles/a1");
      expect(seen[0]!.method).toBe("PATCH");
    });

    it("publishArticle POSTs to the publish endpoint", async () => {
      const seen: string[] = [];
      stub((url) => {
        seen.push(url);
        return { article: { ...article, status: "published" } };
      });
      const r = await publishArticle("a1");
      expect(r.article.status).toBe("published");
      expect(seen[0]).toContain("/admin/articles/a1/publish");
    });

    it("unpublishArticle POSTs to the unpublish endpoint", async () => {
      const seen: string[] = [];
      stub((url) => {
        seen.push(url);
        return { article };
      });
      await unpublishArticle("a1");
      expect(seen[0]).toContain("/admin/articles/a1/unpublish");
    });
  });
});
