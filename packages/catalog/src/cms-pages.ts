import { asc, desc, eq } from "drizzle-orm";
import {
  cmsPages,
  cmsPageRevisions,
  type CmsPageRow,
  type CmsPageRevisionRow,
  type CmsBodySection,
  type CmsPageSnapshot,
} from "@bm/db";
import type { Executor } from "./services.js";

/**
 * P6-E06-S03 (Story 36.3) — CMS-driven unit pages. A lightweight, DB-backed CMS so
 * admins edit the public per-unit marketing pages (hero copy / image, CTA, an
 * ordered list of body sections) WITHOUT a deploy. The platform's per-unit public
 * pages render the PUBLISHED `cms_pages` row when one exists, falling back to the
 * existing static `unit-content` model otherwise.
 *
 *   - {@link savePage} — create or update a page (upsert by slug). Editing a
 *     published page reverts it to `draft` until re-published (AC2). EVERY save
 *     appends a {@link CmsPageSnapshot} revision (AC3).
 *   - {@link publishPage} — flip status to `published`, stamp `published_at`, and
 *     append a publish revision (AC2/AC3).
 *   - {@link getPublishedPage} — the public render reads ONLY published rows.
 *   - {@link getDraftPage} / {@link getPage} — the admin preview / editor read the
 *     working (possibly-draft) row.
 *   - {@link listPageRevisions} — the retained history (AC3), newest first.
 */

/** The known CMS page slugs (AC1) — the routable unit keys + the shop landing. */
export const CMS_PAGE_SLUGS = [
  "play",
  "talent",
  "salon",
  "events",
  "coaching",
  "shop",
] as const;
export type CmsPageSlug = (typeof CMS_PAGE_SLUGS)[number];

/** True when `value` is one of the known CMS page slugs. */
export function isCmsPageSlug(value: unknown): value is CmsPageSlug {
  return typeof value === "string" && (CMS_PAGE_SLUGS as readonly string[]).includes(value);
}

/** Raised when a page / section input fails a domain rule (AC1). */
export class CmsPageValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "CmsPageValidationError";
  }
}

/** Validate + normalise an ordered list of body sections (AC1). */
function assertBodySections(sections: readonly CmsBodySection[]): CmsBodySection[] {
  if (!Array.isArray(sections)) {
    throw new CmsPageValidationError("bodySections", "body_sections must be an array");
  }
  return sections.map((s, i) => {
    const heading = String(s?.heading ?? "").trim();
    if (heading.length === 0) {
      throw new CmsPageValidationError("bodySections", `Section ${i + 1} is missing a heading`);
    }
    return { heading, body: String(s?.body ?? "") };
  });
}

/** Validate a slug is a known unit key (AC1). */
function assertSlug(slug: string): CmsPageSlug {
  if (!isCmsPageSlug(slug)) {
    throw new CmsPageValidationError("slug", `Unknown page slug: ${String(slug)}`);
  }
  return slug;
}

/** Build the immutable revision snapshot from a saved/published page row (AC3). */
function snapshotOf(row: CmsPageRow): CmsPageSnapshot {
  return {
    slug: row.slug,
    status: row.status,
    heroCopy: row.heroCopy,
    heroImageUrl: row.heroImageUrl,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
    bodySections: row.bodySections ?? [],
  };
}

async function appendRevision(
  db: Executor,
  row: CmsPageRow,
  createdBy: string | null,
): Promise<void> {
  await db.insert(cmsPageRevisions).values({
    pageId: row.id,
    snapshot: snapshotOf(row),
    createdBy,
  });
}

export interface SavePageInput {
  slug: string;
  heroCopy: string;
  heroImageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  bodySections: readonly CmsBodySection[];
  /** The admin who is saving (FK to users). */
  updatedBy: string;
}

/**
 * Create or update a page (AC1) — one row per slug (upsert by slug). A save ALWAYS
 * sets `status = 'draft'`: editing a published page reverts it to draft so the
 * public never sees an in-progress edit (AC2); it is re-published via {@link publishPage}.
 * EVERY save appends a revision snapshot (AC3). Returns the saved row.
 */
export async function savePage(db: Executor, input: SavePageInput): Promise<CmsPageRow> {
  const slug = assertSlug(input.slug);
  const bodySections = assertBodySections(input.bodySections);

  const existing = await getPage(db, slug);
  let row: CmsPageRow;
  if (existing) {
    const [updated] = await db
      .update(cmsPages)
      .set({
        status: "draft",
        heroCopy: input.heroCopy,
        heroImageUrl: input.heroImageUrl,
        ctaLabel: input.ctaLabel,
        ctaHref: input.ctaHref,
        bodySections,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(cmsPages.id, existing.id))
      .returning();
    row = updated!;
  } else {
    const [created] = await db
      .insert(cmsPages)
      .values({
        slug,
        status: "draft",
        heroCopy: input.heroCopy,
        heroImageUrl: input.heroImageUrl,
        ctaLabel: input.ctaLabel,
        ctaHref: input.ctaHref,
        bodySections,
        updatedBy: input.updatedBy,
      })
      .returning();
    row = created!;
  }

  await appendRevision(db, row, input.updatedBy);
  return row;
}

export interface PublishPageInput {
  slug: string;
  /** The admin who is publishing (FK to users). */
  publishedBy: string;
}

/**
 * Publish a page (AC2): flip `status` to `published` and stamp `published_at`. Also
 * appends a publish revision (AC3) so the published state is retained in history.
 * Returns the published row, or null when no page exists for the slug.
 */
export async function publishPage(
  db: Executor,
  input: PublishPageInput,
): Promise<CmsPageRow | null> {
  const slug = assertSlug(input.slug);
  const existing = await getPage(db, slug);
  if (!existing) return null;

  const now = new Date();
  const [row] = await db
    .update(cmsPages)
    .set({ status: "published", publishedAt: now, updatedBy: input.publishedBy, updatedAt: now })
    .where(eq(cmsPages.id, existing.id))
    .returning();

  await appendRevision(db, row!, input.publishedBy);
  return row!;
}

/** The working (editor) row for a slug regardless of status, or null. */
export async function getPage(db: Executor, slug: string): Promise<CmsPageRow | null> {
  const [row] = await db.select().from(cmsPages).where(eq(cmsPages.slug, slug)).limit(1);
  return row ?? null;
}

/**
 * The DRAFT/working row for the admin preview (AC2) — the in-progress content,
 * which may be a draft edit of an already-published page. Alias of {@link getPage}
 * with an intent-revealing name for the preview seam.
 */
export async function getDraftPage(db: Executor, slug: string): Promise<CmsPageRow | null> {
  return getPage(db, slug);
}

/**
 * The PUBLISHED content for the public render (AC2). Returns the LAST published
 * snapshot — NOT the working row — so editing a published page (which reverts the
 * working row to `draft`) does NOT take the page off the public site: the public
 * keeps seeing the last published content until a re-publish supersedes it. Null
 * when the page has never been published.
 *
 * The returned shape is a {@link CmsPageRow} whose CONTENT fields come from the
 * published revision snapshot (status forced to `published`) while id/timestamps
 * stay the working row's — the public render only reads content + slug.
 */
export async function getPublishedPage(db: Executor, slug: string): Promise<CmsPageRow | null> {
  const row = await getPage(db, slug);
  if (!row || row.publishedAt === null) return null;

  // The working row is currently published → its content IS the published content.
  if (row.status === "published") return row;

  // The working row is a draft edit of an already-published page. Reconstruct the
  // public content from the most recent PUBLISHED revision snapshot.
  const revisions = await listPageRevisions(db, row.id);
  const lastPublished = revisions.find((r) => r.snapshot.status === "published");
  if (!lastPublished) return null;
  const s = lastPublished.snapshot;
  return {
    ...row,
    status: "published",
    heroCopy: s.heroCopy,
    heroImageUrl: s.heroImageUrl,
    ctaLabel: s.ctaLabel,
    ctaHref: s.ctaHref,
    bodySections: s.bodySections,
  };
}

/** All pages, ordered by slug (the admin list). */
export async function listPages(db: Executor): Promise<CmsPageRow[]> {
  return db.select().from(cmsPages).orderBy(asc(cmsPages.slug));
}

/** The retained revision history for a page (AC3), newest first. */
export async function listPageRevisions(
  db: Executor,
  pageId: string,
): Promise<CmsPageRevisionRow[]> {
  return db
    .select()
    .from(cmsPageRevisions)
    .where(eq(cmsPageRevisions.pageId, pageId))
    .orderBy(desc(cmsPageRevisions.createdAt), desc(cmsPageRevisions.id));
}
