import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import {
  CSRF_HEADER_NAME,
  requirePermission,
  validateSession,
  type SessionStore,
} from "@bm/auth";
import { articleSaveSchema, type ArticleDto } from "@bm/contracts";
import {
  createArticle,
  updateArticle,
  publishArticle,
  unpublishArticle,
  getArticle,
  listArticlesForAdmin,
  ArticleValidationError,
  ArticleSlugTakenError,
} from "@bm/catalog";
import type { ArticleRow } from "@bm/db";

export interface AdminArticlesDeps {
  db: Database;
  sessions: SessionStore;
}

/**
 * Admin Blog / Articles CRUD (P6-E06-S04 / Story 36.4). A DB-backed blog of
 * parenting articles for SEO + engagement (AC1). Each article has a draft/published
 * lifecycle (AC1) and admin CRUD (AC2).
 *
 *   GET    /admin/articles              — list every article (drafts + published).
 *   GET    /admin/articles/:id          — read one article (the editor view).
 *   POST   /admin/articles              — create a draft article (audited).
 *   PATCH  /admin/articles/:id          — update an article (audited).
 *   POST   /admin/articles/:id/publish  — publish (audited).
 *   POST   /admin/articles/:id/unpublish— revert to draft.
 *
 * Editing the public blog is a content mutation, so the whole surface is reserved to
 * `manage config` (admin / super_admin) — the same gate as CMS pages / review
 * snippets (AC2), enforced server-side. Drafts are NEVER exposed by the public surface.
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

/** Project an article row to the wire DTO (ISO dates). */
function toArticleDto(a: ArticleRow): ArticleDto {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    bodyMd: a.bodyMd,
    coverImageUrl: a.coverImageUrl ?? null,
    tags: a.tags ?? [],
    author: a.author,
    status: a.status === "published" ? "published" : "draft",
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export function registerAdminArticles(app: FastifyInstance, deps: AdminArticlesDeps): void {
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

  // List every article (drafts + published), newest-first.
  app.get("/admin/articles", async (req, reply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const rows = await listArticlesForAdmin(db);
    return reply.code(200).send({ articles: rows.map(toArticleDto) });
  });

  // Read one article (the editor view) by id.
  app.get("/admin/articles/:id", async (req, reply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const { id } = req.params as { id: string };
    const row = await getArticle(db, id);
    if (!row) return reply.code(404).send({ error: "Article not found" });
    return reply.code(200).send({ article: toArticleDto(row) });
  });

  // Create a draft article (AC1/AC2). Audited.
  app.post("/admin/articles", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = articleSaveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const data = parsed.data;

    let row: ArticleRow;
    try {
      row = await createArticle(db, {
        slug: data.slug,
        title: data.title,
        bodyMd: data.bodyMd,
        coverImageUrl: data.coverImageUrl,
        tags: data.tags,
        author: data.author,
        createdBy: actor.id,
      });
    } catch (err) {
      if (err instanceof ArticleSlugTakenError) {
        return reply.code(409).send({ error: err.message, field: "slug" });
      }
      if (err instanceof ArticleValidationError) {
        return reply.code(400).send({ error: err.message, field: err.field });
      }
      throw err;
    }

    await audit(db, {
      actor: actor.id,
      action: "article.created",
      target: { table: "articles", id: row.id },
      payload: { slug: row.slug, ip: req.ip },
    });

    return reply.code(201).send({ article: toArticleDto(row) });
  });

  // Update an article (AC2). Audited.
  app.patch("/admin/articles/:id", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };

    const parsed = articleSaveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const data = parsed.data;

    let row: ArticleRow | null;
    try {
      row = await updateArticle(db, id, {
        slug: data.slug,
        title: data.title,
        bodyMd: data.bodyMd,
        coverImageUrl: data.coverImageUrl,
        tags: data.tags,
        author: data.author,
      });
    } catch (err) {
      if (err instanceof ArticleSlugTakenError) {
        return reply.code(409).send({ error: err.message, field: "slug" });
      }
      if (err instanceof ArticleValidationError) {
        return reply.code(400).send({ error: err.message, field: err.field });
      }
      throw err;
    }
    if (!row) return reply.code(404).send({ error: "Article not found" });

    await audit(db, {
      actor: actor.id,
      action: "article.updated",
      target: { table: "articles", id: row.id },
      payload: { slug: row.slug, ip: req.ip },
    });

    return reply.code(200).send({ article: toArticleDto(row) });
  });

  // Publish an article (AC1). Audited.
  app.post("/admin/articles/:id/publish", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };

    const row = await publishArticle(db, id);
    if (!row) return reply.code(404).send({ error: "Article not found" });

    await audit(db, {
      actor: actor.id,
      action: "article.published",
      target: { table: "articles", id: row.id },
      payload: { slug: row.slug, ip: req.ip },
    });

    return reply.code(200).send({ article: toArticleDto(row) });
  });

  // Unpublish an article (revert to draft). Audited.
  app.post("/admin/articles/:id/unpublish", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };

    const row = await unpublishArticle(db, id);
    if (!row) return reply.code(404).send({ error: "Article not found" });

    await audit(db, {
      actor: actor.id,
      action: "article.unpublished",
      target: { table: "articles", id: row.id },
      payload: { slug: row.slug, ip: req.ip },
    });

    return reply.code(200).send({ article: toArticleDto(row) });
  });
}
