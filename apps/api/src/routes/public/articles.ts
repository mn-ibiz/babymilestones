import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getPublishedArticle, listPublishedArticles } from "@bm/catalog";
import type { Database, ArticleRow } from "@bm/db";
import type { PublicArticleDto, PublicArticleSummaryDto } from "@bm/contracts";

/**
 * Public (unauthenticated) Blog endpoints (P6-E06-S04 / Story 36.4). The platform
 * blog pages read these to render the parenting-articles list + per-article detail
 * (AC3).
 *
 *   GET /public/articles[?tag=]   — the PUBLISHED article list (summaries),
 *                                   newest-first, optional tag filter.
 *   GET /public/articles/:slug    — the PUBLISHED article detail (incl. markdown body).
 *
 * CRITICAL (AC3): these surfaces return ONLY PUBLISHED articles. A draft is never
 * exposed — it is absent from the list and 404s on detail. Cached (~5min) so a CDN /
 * browser can reuse the (rarely-changing) blog; an admin publish propagates within
 * the cache window.
 */

export interface PublicArticlesDeps {
  db: Database;
}

/** Cache window: 5 minutes, public — the blog changes rarely; any CDN can reuse it. */
const CACHE_CONTROL = "public, max-age=300";

/** Project a published article row to the lean list-summary DTO (no body). */
function toSummaryDto(a: ArticleRow): PublicArticleSummaryDto {
  return {
    slug: a.slug,
    title: a.title,
    coverImageUrl: a.coverImageUrl ?? null,
    tags: a.tags ?? [],
    author: a.author,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
  };
}

/** Project a published article row to the full detail DTO (incl. markdown body). */
function toDetailDto(a: ArticleRow): PublicArticleDto {
  return {
    slug: a.slug,
    title: a.title,
    bodyMd: a.bodyMd,
    coverImageUrl: a.coverImageUrl ?? null,
    tags: a.tags ?? [],
    author: a.author,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
  };
}

export function registerPublicArticles(app: FastifyInstance, deps: PublicArticlesDeps): void {
  const { db } = deps;

  app.get("/public/articles", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tag } = (req.query ?? {}) as { tag?: string };
    const rows = await listPublishedArticles(db, tag ? { tag } : {});
    reply.header("cache-control", CACHE_CONTROL);
    return reply.code(200).send({ articles: rows.map(toSummaryDto) });
  });

  app.get("/public/articles/:slug", async (req: FastifyRequest, reply: FastifyReply) => {
    const { slug } = req.params as { slug: string };
    const row = await getPublishedArticle(db, slug);
    if (!row) {
      // No published article for this slug (draft or unknown) → not found.
      return reply.code(404).send({ error: "Article not found" });
    }
    reply.header("cache-control", CACHE_CONTROL);
    return reply.code(200).send({ article: toDetailDto(row) });
  });
}
