import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import {
  CSRF_HEADER_NAME,
  requirePermission,
  validateSession,
  type SessionStore,
} from "@bm/auth";
import {
  cmsPageSaveSchema,
  type CmsPageDto,
  type CmsPageRevisionDto,
} from "@bm/contracts";
import {
  savePage,
  publishPage,
  getPage,
  getDraftPage,
  listPages,
  listPageRevisions,
  CmsPageValidationError,
} from "@bm/catalog";
import type { CmsPageRow, CmsPageRevisionRow } from "@bm/db";

export interface AdminCmsPagesDeps {
  db: Database;
  sessions: SessionStore;
}

/**
 * Admin CMS Pages CRUD (P6-E06-S03 / Story 36.3). A lightweight, DB-backed CMS so
 * admins edit the public per-unit marketing pages (hero copy / image, CTA, an
 * ordered list of body sections) WITHOUT a deploy (AC1). Each page has a
 * draft/published lifecycle with admin preview (AC2) and a retained revision
 * history (AC3).
 *
 *   GET    /admin/cms-pages                    — list all unit pages.
 *   GET    /admin/cms-pages/:slug              — read the working page (editor).
 *   POST   /admin/cms-pages                    — create/update a page (save) → draft.
 *   POST   /admin/cms-pages/:slug/publish      — publish the page (audited).
 *   GET    /admin/cms-pages/:slug/preview      — the in-progress DRAFT for preview (AC2).
 *   GET    /admin/cms-pages/:slug/revisions    — the retained revision history (AC3).
 *
 * Editing the public marketing pages is a content mutation, so the whole surface is
 * reserved to `manage config` (admin / super_admin) — enforced server-side. Drafts
 * are NEVER exposed by the public surface; the preview here is behind this gate.
 */
const guard = requirePermission("manage", "config");

function makeResolveUser(db: Database) {
  return async (userId: string) => {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return u ? { id: u.id, role: u.role } : null;
  };
}

function csrfHeaderOf(req: FastifyRequest): string | null {
  const raw = req.headers[CSRF_HEADER_NAME];
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

/** Project a CMS page row to the wire DTO (ISO dates). */
function toPageDto(p: CmsPageRow): CmsPageDto {
  return {
    id: p.id,
    slug: p.slug,
    status: p.status === "published" ? "published" : "draft",
    heroCopy: p.heroCopy,
    heroImageUrl: p.heroImageUrl,
    ctaLabel: p.ctaLabel,
    ctaHref: p.ctaHref,
    bodySections: (p.bodySections ?? []).map((s) => ({ heading: s.heading, body: s.body })),
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Project a revision row to the wire DTO (ISO dates). */
function toRevisionDto(r: CmsPageRevisionRow): CmsPageRevisionDto {
  return {
    id: r.id,
    pageId: r.pageId,
    snapshot: {
      slug: r.snapshot.slug,
      status: r.snapshot.status,
      heroCopy: r.snapshot.heroCopy,
      heroImageUrl: r.snapshot.heroImageUrl,
      ctaLabel: r.snapshot.ctaLabel,
      ctaHref: r.snapshot.ctaHref,
      bodySections: (r.snapshot.bodySections ?? []).map((s) => ({ heading: s.heading, body: s.body })),
    },
    createdAt: r.createdAt.toISOString(),
  };
}

export function registerAdminCmsPages(app: FastifyInstance, deps: AdminCmsPagesDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  /** Authenticate + authorise (manage config). Returns the user or null (reply sent). */
  async function authorize(req: FastifyRequest, reply: FastifyReply) {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    const decision = guard({ id: auth.user.id, role: auth.user.role });
    if (!decision.ok) {
      reply.code(decision.status).send({ error: decision.error });
      return null;
    }
    return auth.user;
  }

  // List all unit pages (the admin index).
  app.get("/admin/cms-pages", async (req, reply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const pages = await listPages(db);
    return reply.code(200).send({ pages: pages.map(toPageDto) });
  });

  // Read one working page (the editor view) by slug.
  app.get("/admin/cms-pages/:slug", async (req, reply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const { slug } = req.params as { slug: string };
    const page = await getPage(db, slug);
    if (!page) return reply.code(404).send({ error: "Page not found" });
    return reply.code(200).send({ page: toPageDto(page) });
  });

  // The in-progress DRAFT for preview (AC2). Admin-only (behind this gate) — drafts
  // are never exposed publicly.
  app.get("/admin/cms-pages/:slug/preview", async (req, reply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const { slug } = req.params as { slug: string };
    const page = await getDraftPage(db, slug);
    if (!page) return reply.code(404).send({ error: "Page not found" });
    return reply.code(200).send({ page: toPageDto(page) });
  });

  // The retained revision history (AC3), newest first.
  app.get("/admin/cms-pages/:slug/revisions", async (req, reply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const { slug } = req.params as { slug: string };
    const page = await getPage(db, slug);
    if (!page) return reply.code(404).send({ error: "Page not found" });
    const revisions = await listPageRevisions(db, page.id);
    return reply.code(200).send({ revisions: revisions.map(toRevisionDto) });
  });

  // Create or update (save) a page → draft (AC1). Audits created vs updated.
  app.post("/admin/cms-pages", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = cmsPageSaveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const data = parsed.data;
    const existed = (await getPage(db, data.slug)) !== null;

    let row: CmsPageRow;
    try {
      row = await savePage(db, {
        slug: data.slug,
        heroCopy: data.heroCopy,
        heroImageUrl: data.heroImageUrl,
        ctaLabel: data.ctaLabel,
        ctaHref: data.ctaHref,
        bodySections: data.bodySections,
        updatedBy: actor.id,
      });
    } catch (err) {
      if (err instanceof CmsPageValidationError) {
        return reply.code(400).send({ error: err.message, field: err.field });
      }
      throw err;
    }

    await audit(db, {
      actor: actor.id,
      action: existed ? "cms.page.updated" : "cms.page.created",
      target: { table: "cms_pages", id: row.id },
      payload: { slug: row.slug, ip: req.ip },
    });

    return reply.code(201).send({ page: toPageDto(row) });
  });

  // Publish a page (AC2): flip status + stamp published_at + retain a revision (AC3).
  app.post("/admin/cms-pages/:slug/publish", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { slug } = req.params as { slug: string };

    let row: CmsPageRow | null;
    try {
      row = await publishPage(db, { slug, publishedBy: actor.id });
    } catch (err) {
      if (err instanceof CmsPageValidationError) {
        return reply.code(400).send({ error: err.message, field: err.field });
      }
      throw err;
    }
    if (!row) return reply.code(404).send({ error: "Page not found" });

    await audit(db, {
      actor: actor.id,
      action: "cms.page.published",
      target: { table: "cms_pages", id: row.id },
      payload: { slug: row.slug, ip: req.ip },
    });

    return reply.code(200).send({ page: toPageDto(row) });
  });
}
