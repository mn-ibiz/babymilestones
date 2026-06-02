import { apiFetch } from "./api";
import type {
  CmsPageDto,
  CmsPageRevisionDto,
  CmsBodySectionDto,
  CmsPageSaveInput,
  CmsPageSlug,
} from "@bm/contracts";

/**
 * Admin CMS Pages client logic (P6-E06-S03 / Story 36.3). The `/pages` admin screen
 * reads the `manage config`-gated `/admin/cms-pages` API (credentialed — session
 * cookie + CSRF) to list unit pages, edit one (hero / image / CTA / body sections),
 * preview the draft, publish, and view the retained revision history. Framework-free
 * so it unit-tests without React.
 */

export type CmsPage = CmsPageDto;
export type CmsRevision = CmsPageRevisionDto;
export type CmsSection = CmsBodySectionDto;

/** A row in the page-slug picker. */
export interface CmsPageOption {
  value: CmsPageSlug;
  label: string;
}

/** The known editable page slugs + their human labels. */
export const CMS_PAGE_OPTIONS: readonly CmsPageOption[] = [
  { value: "play", label: "Play" },
  { value: "talent", label: "Talent" },
  { value: "salon", label: "Salon" },
  { value: "events", label: "Events" },
  { value: "coaching", label: "Coaching" },
  { value: "shop", label: "Shop" },
];

/** The editable form state for one page. */
export interface CmsPageForm {
  slug: CmsPageSlug;
  heroCopy: string;
  heroImageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  bodySections: CmsSection[];
}

/** A blank form for a slug (a page that has never been saved). */
export function emptyPageForm(slug: CmsPageSlug): CmsPageForm {
  return { slug, heroCopy: "", heroImageUrl: "", ctaLabel: "", ctaHref: "", bodySections: [] };
}

/** Map a saved page DTO into editable form state. */
export function pageToForm(page: CmsPage): CmsPageForm {
  return {
    slug: page.slug as CmsPageSlug,
    heroCopy: page.heroCopy,
    heroImageUrl: page.heroImageUrl,
    ctaLabel: page.ctaLabel,
    ctaHref: page.ctaHref,
    bodySections: page.bodySections.map((s) => ({ heading: s.heading, body: s.body })),
  };
}

/** Build the save payload from form state. */
export function formToSave(form: CmsPageForm): CmsPageSaveInput {
  return {
    slug: form.slug,
    heroCopy: form.heroCopy,
    heroImageUrl: form.heroImageUrl,
    ctaLabel: form.ctaLabel,
    ctaHref: form.ctaHref,
    bodySections: form.bodySections.map((s) => ({ heading: s.heading, body: s.body })),
  };
}

/** A render-ready revision row. */
export interface CmsRevisionRowView {
  id: string;
  status: string;
  heroCopy: string;
  createdAt: string;
}

/** Shape revision DTOs into render-ready rows (newest-first preserved). */
export function revisionRows(revs: readonly CmsRevision[]): CmsRevisionRowView[] {
  return revs.map((r) => ({
    id: r.id,
    status: r.snapshot.status,
    heroCopy: r.snapshot.heroCopy,
    createdAt: r.createdAt,
  }));
}

/* ------------------------------------------------------------- API wrappers */

/** List all unit pages. */
export function fetchPages(): Promise<{ pages: CmsPage[] }> {
  return apiFetch<{ pages: CmsPage[] }>("/admin/cms-pages");
}

/** Read one working page (the editor view) by slug. */
export function fetchPage(slug: string): Promise<{ page: CmsPage }> {
  return apiFetch<{ page: CmsPage }>(`/admin/cms-pages/${slug}`);
}

/** The in-progress DRAFT for preview (AC2). */
export function fetchPreview(slug: string): Promise<{ page: CmsPage }> {
  return apiFetch<{ page: CmsPage }>(`/admin/cms-pages/${slug}/preview`);
}

/** The retained revision history (AC3). */
export function fetchRevisions(slug: string): Promise<{ revisions: CmsRevision[] }> {
  return apiFetch<{ revisions: CmsRevision[] }>(`/admin/cms-pages/${slug}/revisions`);
}

/** Create or update (save) a page → draft (AC1). */
export function savePage(input: CmsPageSaveInput): Promise<{ page: CmsPage }> {
  return apiFetch<{ page: CmsPage }>("/admin/cms-pages", { method: "POST", body: input });
}

/** Publish a page (AC2). */
export function publishPage(slug: string): Promise<{ page: CmsPage }> {
  return apiFetch<{ page: CmsPage }>(`/admin/cms-pages/${slug}/publish`, { method: "POST" });
}
