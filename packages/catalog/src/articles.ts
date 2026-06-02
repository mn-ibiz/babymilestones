import { and, arrayContains, desc, eq } from "drizzle-orm";
import { articles, type ArticleRow } from "@bm/db";
import type { Executor } from "./services.js";

/**
 * P6-E06-S04 (Story 36.4) — Blog / parenting stories module. A DB-backed blog of
 * parenting articles for SEO + engagement. Each row is a slugged, tagged, authored
 * markdown post with a draft/published lifecycle (AC1).
 *
 *   - {@link createArticle} / {@link updateArticle} — admin CRUD (AC2). Both
 *     validate the slug FORMAT + non-empty title/body/author and enforce slug
 *     UNIQUENESS.
 *   - {@link publishArticle} / {@link unpublishArticle} — flip the lifecycle. Publish
 *     stamps `publishedAt`; unpublish reverts to draft and clears the public surface.
 *   - {@link getPublishedArticle} / {@link listPublishedArticles} — the PUBLIC reads:
 *     published rows ONLY (drafts are never exposed), newest-first, optional tag filter.
 *   - {@link getArticle} / {@link getArticleBySlug} / {@link listArticlesForAdmin} —
 *     the admin reads: every row regardless of status.
 */

/** Raised when an article input fails a domain rule (AC1). */
export class ArticleValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "ArticleValidationError";
  }
}

/** Raised when a slug is already taken by another article (uniqueness, AC1). */
export class ArticleSlugTakenError extends Error {
  constructor(public readonly slug: string) {
    super(`Slug already in use: ${slug}`);
    this.name = "ArticleSlugTakenError";
  }
}

/** A well-formed slug: lowercase kebab-case, single hyphens, no edges (AC1). */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** Validate + normalise the editable content of an article (AC1). */
function assertContent(input: {
  slug: string;
  title: string;
  bodyMd: string;
  author: string;
  tags?: readonly string[];
  coverImageUrl?: string | null;
}): {
  slug: string;
  title: string;
  bodyMd: string;
  author: string;
  tags: string[];
  coverImageUrl: string | null;
} {
  const slug = String(input.slug ?? "").trim();
  if (!SLUG_RE.test(slug)) {
    throw new ArticleValidationError("slug", "Slug must be lowercase kebab-case (a-z, 0-9, single hyphens)");
  }
  const title = String(input.title ?? "").trim();
  if (title.length === 0) throw new ArticleValidationError("title", "Title is required");
  const bodyMd = String(input.bodyMd ?? "").trim();
  if (bodyMd.length === 0) throw new ArticleValidationError("bodyMd", "Body is required");
  const author = String(input.author ?? "").trim();
  if (author.length === 0) throw new ArticleValidationError("author", "Author is required");

  const tags = (input.tags ?? [])
    .map((t) => String(t).trim())
    .filter((t) => t.length > 0);
  const cover =
    input.coverImageUrl != null && String(input.coverImageUrl).trim() !== ""
      ? String(input.coverImageUrl).trim()
      : null;

  return { slug, title, bodyMd, author, tags, coverImageUrl: cover };
}

/** Throw {@link ArticleSlugTakenError} if `slug` is held by a row other than `exceptId`. */
async function assertSlugFree(db: Executor, slug: string, exceptId?: string): Promise<void> {
  const [clash] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.slug, slug))
    .limit(1);
  if (clash && clash.id !== exceptId) throw new ArticleSlugTakenError(slug);
}

export interface CreateArticleInput {
  slug: string;
  title: string;
  bodyMd: string;
  coverImageUrl?: string | null;
  tags?: readonly string[];
  author: string;
  /** The admin creating the article (FK to users). */
  createdBy: string;
}

/** Create a draft article (AC1/AC2). Validates content + slug uniqueness. */
export async function createArticle(db: Executor, input: CreateArticleInput): Promise<ArticleRow> {
  const c = assertContent(input);
  await assertSlugFree(db, c.slug);
  const [row] = await db
    .insert(articles)
    .values({
      slug: c.slug,
      title: c.title,
      bodyMd: c.bodyMd,
      coverImageUrl: c.coverImageUrl,
      tags: c.tags,
      author: c.author,
      status: "draft",
      createdBy: input.createdBy,
    })
    .returning();
  return row!;
}

export interface UpdateArticleInput {
  slug: string;
  title: string;
  bodyMd: string;
  coverImageUrl?: string | null;
  tags?: readonly string[];
  author: string;
}

/**
 * Update an article's editable content by id (AC1/AC2). Validates content + slug
 * uniqueness (a same-slug update is allowed). Returns null for an unknown id.
 */
export async function updateArticle(
  db: Executor,
  id: string,
  input: UpdateArticleInput,
): Promise<ArticleRow | null> {
  const existing = await getArticle(db, id);
  if (!existing) return null;
  const c = assertContent(input);
  await assertSlugFree(db, c.slug, id);
  const [row] = await db
    .update(articles)
    .set({
      slug: c.slug,
      title: c.title,
      bodyMd: c.bodyMd,
      coverImageUrl: c.coverImageUrl,
      tags: c.tags,
      author: c.author,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, id))
    .returning();
  return row ?? null;
}

/** Publish an article (AC1): flip to published + stamp publishedAt. Null on unknown id. */
export async function publishArticle(db: Executor, id: string): Promise<ArticleRow | null> {
  const now = new Date();
  const [row] = await db
    .update(articles)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(eq(articles.id, id))
    .returning();
  return row ?? null;
}

/** Unpublish an article (AC1): revert to draft (it leaves the public surface). */
export async function unpublishArticle(db: Executor, id: string): Promise<ArticleRow | null> {
  const [row] = await db
    .update(articles)
    .set({ status: "draft", publishedAt: null, updatedAt: new Date() })
    .where(eq(articles.id, id))
    .returning();
  return row ?? null;
}

/** The working article by id, regardless of status (admin read). Null when absent. */
export async function getArticle(db: Executor, id: string): Promise<ArticleRow | null> {
  const [row] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  return row ?? null;
}

/** The working article by slug, regardless of status (admin read). Null when absent. */
export async function getArticleBySlug(db: Executor, slug: string): Promise<ArticleRow | null> {
  const [row] = await db.select().from(articles).where(eq(articles.slug, slug)).limit(1);
  return row ?? null;
}

/**
 * The PUBLISHED article for a slug (public detail, AC3). Returns ONLY published
 * rows — a draft (or unpublished) article resolves to null, so drafts are never
 * exposed to the public surface.
 */
export async function getPublishedArticle(db: Executor, slug: string): Promise<ArticleRow | null> {
  const [row] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.slug, slug), eq(articles.status, "published")))
    .limit(1);
  return row ?? null;
}

export interface ListPublishedOptions {
  /** When set, only published articles carrying this tag are returned. */
  tag?: string;
}

/**
 * The PUBLISHED article list (public index, AC3): published rows ONLY, newest-first
 * by `publishedAt`, with an optional tag filter. Drafts are never included.
 */
export async function listPublishedArticles(
  db: Executor,
  opts: ListPublishedOptions = {},
): Promise<ArticleRow[]> {
  const where =
    opts.tag && opts.tag.trim() !== ""
      ? and(eq(articles.status, "published"), arrayContains(articles.tags, [opts.tag.trim()]))
      : eq(articles.status, "published");
  return db
    .select()
    .from(articles)
    .where(where)
    .orderBy(desc(articles.publishedAt), desc(articles.createdAt));
}

/** Every article (drafts + published), newest-first by creation (admin list, AC2). */
export async function listArticlesForAdmin(db: Executor): Promise<ArticleRow[]> {
  return db.select().from(articles).orderBy(desc(articles.createdAt), desc(articles.id));
}
