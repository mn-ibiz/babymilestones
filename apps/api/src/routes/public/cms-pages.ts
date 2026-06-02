import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getPublishedPage } from "@bm/catalog";
import type { Database } from "@bm/db";
import type { PublicCmsPageDto } from "@bm/contracts";

/**
 * Public (unauthenticated) CMS page endpoint (P6-E06-S03 / Story 36.3). The
 * platform per-unit public marketing pages read this to render admin-edited content
 * when a PUBLISHED page exists, falling back to their static `unit-content` model
 * otherwise (a 404 here = "no override; use the static page").
 *
 * CRITICAL (AC2): this surface returns ONLY the PUBLISHED content. A draft — and an
 * in-progress draft EDIT of an already-published page — is never exposed here; the
 * latter keeps serving the LAST published content (see {@link getPublishedPage}).
 * Drafts are previewed exclusively behind the `manage config` admin gate.
 *
 * Cached (~5min) so a CDN / browser can reuse the (rarely-changing) page; an admin
 * publish propagates within the cache window.
 */

export interface PublicCmsPagesDeps {
  db: Database;
}

/** Cache window: 5 minutes, public — pages change rarely; any CDN can reuse it. */
const CACHE_CONTROL = "public, max-age=300";

export function registerPublicCmsPages(app: FastifyInstance, deps: PublicCmsPagesDeps): void {
  const { db } = deps;

  app.get("/public/cms-pages/:slug", async (req: FastifyRequest, reply: FastifyReply) => {
    const { slug } = req.params as { slug: string };
    const page = await getPublishedPage(db, slug);
    if (!page) {
      // No published override → the platform renders its static fallback page.
      return reply.code(404).send({ error: "No published page" });
    }
    const dto: PublicCmsPageDto = {
      slug: page.slug,
      heroCopy: page.heroCopy,
      heroImageUrl: page.heroImageUrl,
      ctaLabel: page.ctaLabel,
      ctaHref: page.ctaHref,
      bodySections: (page.bodySections ?? []).map((s) => ({ heading: s.heading, body: s.body })),
    };
    reply.header("cache-control", CACHE_CONTROL);
    return reply.code(200).send({ page: dto });
  });
}
