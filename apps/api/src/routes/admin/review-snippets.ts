import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database } from "@bm/db";
import {
  CSRF_HEADER_NAME,
  requirePermission,
  validateSession,
  type SessionStore,
} from "@bm/auth";
import {
  curateReviewSnippetSchema,
  updateReviewAttributionSchema,
  reorderReviewSnippetsSchema,
  type AdminReviewSnippetDto,
  type AdminReviewSnippetsResponse,
  type ReviewSnippetCandidateDto,
} from "@bm/contracts";
import {
  curateReviewSnippet,
  publishReviewSnippet,
  unpublishReviewSnippet,
  updateSnippetAttribution,
  reorderReviewSnippets,
  listFiveStarCandidates,
  listSnippetsForAdmin,
  ReviewSnippetNotFiveStarError,
  ReviewSnippetNoCommentError,
  ReviewSnippetNotFoundError,
  type AdminReviewSnippet,
} from "@bm/catalog";

export interface AdminReviewSnippetsDeps {
  db: Database;
  sessions: SessionStore;
}

/**
 * Admin review-snippets curation (P6-E04-S04 / Story 34.4). The admin curates which
 * 5-star feedback comments to publish as ANONYMISED testimonials on the marketing
 * home page (AC1), then PUBLISHES / UNPUBLISHES them (audited, AC3).
 *
 *   GET   /admin/review-snippets                     — 5-star candidates + curated snippets.
 *   POST  /admin/review-snippets                     — curate a 5-star feedback (rejects non-5★).
 *   POST  /admin/review-snippets/:id/attribution     — edit the anonymised attribution label.
 *   POST  /admin/review-snippets/:id/publish          — publish (audited).
 *   POST  /admin/review-snippets/:id/unpublish        — unpublish (audited).
 *   POST  /admin/review-snippets/reorder              — set the home-page display order.
 *
 * Curation + publication are content-management mutations, so the whole surface is
 * reserved to `manage config` (admin / super_admin) — enforced server-side. The
 * attribution can ALWAYS be overridden to guarantee privacy + accuracy (AC1).
 */
const guard = requirePermission("manage", "config");

/** Resolve a session userId to its live id+role (for the permission guard). */
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

/** Project a catalog admin snippet to the wire DTO (ISO dates). */
function toDto(s: AdminReviewSnippet): AdminReviewSnippetDto {
  return {
    id: s.id,
    feedbackId: s.feedbackId,
    quote: s.quote,
    attributionLabel: s.attributionLabel,
    published: s.published,
    publishedAt: s.publishedAt ? s.publishedAt.toISOString() : null,
    displayOrder: s.displayOrder,
    createdAt: s.createdAt.toISOString(),
  };
}

export function registerAdminReviewSnippets(app: FastifyInstance, deps: AdminReviewSnippetsDeps): void {
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

  /** Reload one snippet as a DTO (after a mutation) by id. */
  async function snippetDtoById(id: string): Promise<AdminReviewSnippetDto | null> {
    const all = await listSnippetsForAdmin(db);
    const found = all.find((s) => s.id === id);
    return found ? toDto(found) : null;
  }

  // The curation screen: 5-star candidates + the already-curated snippets.
  app.get("/admin/review-snippets", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const candidates = await listFiveStarCandidates(db);
    const snippets = await listSnippetsForAdmin(db);
    const out: AdminReviewSnippetsResponse = {
      candidates: candidates.map<ReviewSnippetCandidateDto>((c) => ({
        feedbackId: c.feedbackId,
        comment: c.comment,
        rating: c.rating,
        submittedAt: c.submittedAt.toISOString(),
        suggestedAttribution: c.suggestedAttribution,
      })),
      snippets: snippets.map(toDto),
    };
    return reply.code(200).send(out);
  });

  // Curate a 5-star feedback into a snippet (rejects a non-5★ / comment-less one).
  app.post("/admin/review-snippets", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const parsed = curateReviewSnippetSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    try {
      const snippet = await curateReviewSnippet(db, {
        feedbackId: parsed.data.feedbackId,
        actor: user.id,
        quote: parsed.data.quote,
        attributionLabel: parsed.data.attributionLabel,
      });
      const dto = await snippetDtoById(snippet.id);
      return reply.code(201).send({ snippet: dto });
    } catch (err: unknown) {
      if (err instanceof ReviewSnippetNotFiveStarError || err instanceof ReviewSnippetNoCommentError) {
        return reply.code(400).send({ error: err.message });
      }
      if (err instanceof ReviewSnippetNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });

  // Edit the anonymised attribution label (AC1 privacy guarantee).
  app.post("/admin/review-snippets/:id/attribution", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const parsed = updateReviewAttributionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { id } = req.params as { id: string };
    try {
      await updateSnippetAttribution(db, { snippetId: id, attributionLabel: parsed.data.attributionLabel });
    } catch (err: unknown) {
      if (err instanceof ReviewSnippetNotFoundError) return reply.code(404).send({ error: err.message });
      throw err;
    }
    return reply.code(200).send({ snippet: await snippetDtoById(id) });
  });

  // Publish a snippet to the public home page (audited, AC3).
  app.post("/admin/review-snippets/:id/publish", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const { id } = req.params as { id: string };
    try {
      await publishReviewSnippet(db, { snippetId: id, actor: user.id, ip: req.ip });
    } catch (err: unknown) {
      if (err instanceof ReviewSnippetNotFoundError) return reply.code(404).send({ error: err.message });
      throw err;
    }
    return reply.code(200).send({ snippet: await snippetDtoById(id) });
  });

  // Unpublish a snippet (audited, AC3).
  app.post("/admin/review-snippets/:id/unpublish", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const { id } = req.params as { id: string };
    try {
      await unpublishReviewSnippet(db, { snippetId: id, actor: user.id, ip: req.ip });
    } catch (err: unknown) {
      if (err instanceof ReviewSnippetNotFoundError) return reply.code(404).send({ error: err.message });
      throw err;
    }
    return reply.code(200).send({ snippet: await snippetDtoById(id) });
  });

  // Set the home-page display order of the snippets.
  app.post("/admin/review-snippets/reorder", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const parsed = reorderReviewSnippetsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    await reorderReviewSnippets(db, { orderedIds: parsed.data.orderedIds });
    const snippets = await listSnippetsForAdmin(db);
    return reply.code(200).send({ snippets: snippets.map(toDto) });
  });
}
