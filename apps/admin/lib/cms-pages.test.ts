import { describe, expect, it, vi, afterEach } from "vitest";
import {
  CMS_PAGE_OPTIONS,
  emptyPageForm,
  pageToForm,
  formToSave,
  revisionRows,
  fetchPages,
  savePage,
  publishPage,
  fetchPreview,
  fetchRevisions,
  type CmsPage,
  type CmsRevision,
} from "./cms-pages";

/**
 * P6-E06-S03 (Story 36.3) — admin CMS Pages client logic. Framework-free view-model
 * shaping (pure) + thin API wrappers (driven through a stubbed fetch).
 */
describe("cms-pages admin lib (P6-E06-S03 / Story 36.3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const page: CmsPage = {
    id: "p1",
    slug: "play",
    status: "draft",
    heroCopy: "Hero.",
    heroImageUrl: "https://x/y.jpg",
    ctaLabel: "Book now",
    ctaHref: "/signup",
    bodySections: [{ heading: "What we offer", body: "Soft play." }],
    publishedAt: null,
    updatedAt: "2026-06-01T00:00:00.000Z",
  };

  it("offers a slug option per known unit page", () => {
    expect(CMS_PAGE_OPTIONS.map((o) => o.value)).toEqual([
      "play",
      "talent",
      "salon",
      "events",
      "coaching",
      "shop",
    ]);
  });

  it("emptyPageForm seeds a slug with blank content + no sections", () => {
    const f = emptyPageForm("salon");
    expect(f.slug).toBe("salon");
    expect(f.heroCopy).toBe("");
    expect(f.bodySections).toEqual([]);
  });

  it("pageToForm maps a page DTO into editable form state", () => {
    const f = pageToForm(page);
    expect(f.slug).toBe("play");
    expect(f.heroCopy).toBe("Hero.");
    expect(f.bodySections).toEqual([{ heading: "What we offer", body: "Soft play." }]);
  });

  it("formToSave produces the save payload", () => {
    const payload = formToSave(pageToForm(page));
    expect(payload).toEqual({
      slug: "play",
      heroCopy: "Hero.",
      heroImageUrl: "https://x/y.jpg",
      ctaLabel: "Book now",
      ctaHref: "/signup",
      bodySections: [{ heading: "What we offer", body: "Soft play." }],
    });
  });

  it("revisionRows shapes revisions into render-ready rows", () => {
    const revs: CmsRevision[] = [
      {
        id: "r2",
        pageId: "p1",
        snapshot: { ...page, status: "published" },
        createdAt: "2026-06-02T09:00:00.000Z",
      },
      {
        id: "r1",
        pageId: "p1",
        snapshot: { ...page, status: "draft" },
        createdAt: "2026-06-01T09:00:00.000Z",
      },
    ];
    const rows = revisionRows(revs);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.status).toBe("published");
    expect(rows[0]!.heroCopy).toBe("Hero.");
  });

  describe("API wrappers", () => {
    function stub(handler: (url: string, init?: unknown) => unknown): void {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: unknown) => {
          const body = handler(url, init);
          return { ok: true, status: 200, json: async () => body } as unknown as Response;
        }),
      );
    }

    it("fetchPages GETs the list", async () => {
      stub(() => ({ pages: [page] }));
      const r = await fetchPages();
      expect(r.pages[0]!.slug).toBe("play");
    });

    it("savePage POSTs the payload", async () => {
      const seen: string[] = [];
      stub((url) => {
        seen.push(url);
        return { page };
      });
      const r = await savePage(formToSave(pageToForm(page)));
      expect(r.page.slug).toBe("play");
      expect(seen[0]).toContain("/admin/cms-pages");
    });

    it("publishPage POSTs to the publish endpoint", async () => {
      const seen: string[] = [];
      stub((url) => {
        seen.push(url);
        return { page: { ...page, status: "published" } };
      });
      const r = await publishPage("play");
      expect(r.page.status).toBe("published");
      expect(seen[0]).toContain("/admin/cms-pages/play/publish");
    });

    it("fetchPreview GETs the preview endpoint", async () => {
      const seen: string[] = [];
      stub((url) => {
        seen.push(url);
        return { page };
      });
      await fetchPreview("play");
      expect(seen[0]).toContain("/admin/cms-pages/play/preview");
    });

    it("fetchRevisions GETs the revisions endpoint", async () => {
      const seen: string[] = [];
      stub((url) => {
        seen.push(url);
        return { revisions: [] };
      });
      await fetchRevisions("play");
      expect(seen[0]).toContain("/admin/cms-pages/play/revisions");
    });
  });
});
