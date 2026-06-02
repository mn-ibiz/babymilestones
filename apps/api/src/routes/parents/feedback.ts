import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { parents, users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import {
  listPendingFeedbackForParent,
  submitFeedback,
  FeedbackCommentTooLongError,
  FeedbackInvitationNotFoundError,
  FeedbackNotOwnedError,
  InvalidFeedbackRatingError,
} from "@bm/catalog";
import type { ParentsDeps } from "./index.js";

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

/** Resolve the session parent's user id (the feedback owner key). */
async function resolveParent(
  db: Database,
  sessions: ParentsDeps["sessions"],
  req: FastifyRequest,
  reply: FastifyReply,
  csrf: string | null,
): Promise<{ userId: string } | null> {
  const auth = await validateSession(
    { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrf },
    { sessions, resolveUser: makeResolveUser(db) },
  );
  if (!auth.ok) {
    reply.code(auth.status).send({ error: auth.error });
    return null;
  }
  const [profile] = await db.select().from(parents).where(eq(parents.userId, auth.user.id));
  if (!profile) {
    reply.code(404).send({ error: "Parent profile not found" });
    return null;
  }
  return { userId: auth.user.id };
}

/**
 * Parent feedback surface (P6-E04-S01 / Story 34.1) — the in-app prompt's data +
 * one-tap submit.
 *
 *  GET  /parents/me/feedback          — the authed parent's PENDING (unsubmitted)
 *                                       invitations (scoped to the parent, AC2).
 *  POST /parents/me/feedback/submit   — record a 0–5 rating + optional ≤200-char
 *                                       comment for a token (idempotent, AC3). The
 *                                       module enforces ownership (a parent can
 *                                       never submit another parent's invitation).
 *
 * Ownership is derived server-side from the session; the submit also re-checks
 * ownership inside the module by the resolved user id. The read is not audited;
 * the submit is (feedback.submitted, inside @bm/catalog). The mutation requires
 * the CSRF token.
 */
export function registerParentFeedback(app: FastifyInstance, deps: ParentsDeps): void {
  const { db, sessions } = deps;

  app.get("/parents/me/feedback", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await resolveParent(db, sessions, req, reply, null);
    if (!ctx) return reply;
    const pending = await listPendingFeedbackForParent(db, ctx.userId);
    return reply.code(200).send({
      pending: pending.map((p) => ({
        token: p.token,
        sourceType: p.sourceType,
        invitedAt: p.invitedAt.toISOString(),
      })),
    });
  });

  app.post("/parents/me/feedback/submit", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await resolveParent(db, sessions, req, reply, csrfHeaderOf(req));
    if (!ctx) return reply;

    const body = (req.body ?? {}) as { token?: unknown; rating?: unknown; comment?: unknown };
    if (typeof body.token !== "string" || body.token.trim() === "") {
      return reply.code(400).send({ error: "token is required" });
    }
    if (!Number.isInteger(body.rating)) {
      return reply.code(400).send({ error: "rating must be a whole number from 0 to 5" });
    }
    const comment =
      body.comment === undefined || body.comment === null
        ? null
        : typeof body.comment === "string"
          ? body.comment
          : undefined;
    if (comment === undefined) {
      return reply.code(400).send({ error: "comment must be text" });
    }

    try {
      const out = await submitFeedback(db, {
        token: body.token,
        parentId: ctx.userId,
        rating: body.rating as number,
        comment,
        actor: ctx.userId,
        ip: req.ip,
      });
      return reply.code(200).send({
        token: out.token,
        rating: out.rating,
        comment: out.comment,
        submittedAt: out.submittedAt?.toISOString() ?? null,
      });
    } catch (err) {
      if (err instanceof FeedbackInvitationNotFoundError) {
        return reply.code(404).send({ error: "Feedback invitation not found" });
      }
      if (err instanceof FeedbackNotOwnedError) {
        // Do not reveal another parent's invitation exists — treat as not found.
        return reply.code(404).send({ error: "Feedback invitation not found" });
      }
      if (err instanceof InvalidFeedbackRatingError) {
        return reply.code(400).send({ error: "rating must be a whole number from 0 to 5" });
      }
      if (err instanceof FeedbackCommentTooLongError) {
        return reply.code(400).send({ error: "comment must be 200 characters or fewer" });
      }
      throw err;
    }
  });
}
