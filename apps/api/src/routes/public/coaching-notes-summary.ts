import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { staff, type Database } from "@bm/db";
import { getCoachById, listCoachingSessionNoteSummaryForCoach } from "@bm/catalog";
import type { CoachingSessionNoteSummaryDto } from "@bm/contracts";
import { StaffEarningsRateLimiter } from "./staff-earnings.js";

/**
 * Public (unauthenticated) COACH session-note SUMMARY viewer (P5-E01-S04 / Story
 * 31.4, AC2 security decision). Mirrors the P3-E02 named-not-auth staff-earnings
 * viewer: a coach (who has NO login) picks their name on the reception PC and sees
 * how many private notes exist for them and when.
 *
 * CRITICAL (AC2/AC3): this surface NEVER returns note CONTENT — not the plaintext
 * and not the encrypted envelope. Coaching content is sensitive and this route is
 * internet-reachable without a session, so exposing decrypted content here would
 * leak it to anyone who picked the coach's name. Full decrypted content requires the
 * authenticated admin/reception path. Only a non-sensitive count + per-note dates
 * cross this boundary.
 *
 * Reuses the same per-IP rate limiter (anti-scrape) + 60s cache window as the
 * earnings viewer, since it is the same kiosk-style unauthenticated surface.
 */
const CACHE_CONTROL = "public, max-age=60";

export interface PublicCoachingNotesSummaryDeps {
  db: Database;
  /** Anti-scrape limiter — shared with the staff-earnings viewer when wired together. */
  rateLimiter?: StaffEarningsRateLimiter;
}

export function registerPublicCoachingNotesSummary(
  app: FastifyInstance,
  deps: PublicCoachingNotesSummaryDeps,
): void {
  const { db } = deps;
  const rateLimiter = deps.rateLimiter ?? new StaffEarningsRateLimiter();

  function gate(req: FastifyRequest, reply: FastifyReply): boolean {
    const result = rateLimiter.check(req.ip);
    if (!result.allowed) {
      reply.header("retry-after", String(result.retryAfter));
      reply.code(429).send({ error: "Too many requests. Try again shortly." });
      return false;
    }
    return true;
  }

  // Dropdown of coaches (active, role = 'coach') — display names only, no PII.
  app.get("/public/coaching-notes", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!gate(req, reply)) return reply;
    const rows = await db
      .select({ id: staff.id, displayName: staff.displayName })
      .from(staff)
      .where(eq(staff.role, "coach"));
    reply.header("cache-control", CACHE_CONTROL);
    return reply.code(200).send({
      coaches: rows.map((r) => ({ id: r.id, displayName: r.displayName })),
    });
  });

  // One coach's CONTENT-FREE summary: counts + dates only (AC2). 404 for unknown.
  app.get("/public/coaching-notes/:staffId", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!gate(req, reply)) return reply;
    const { staffId } = req.params as { staffId: string };
    const coach = await getCoachById(db, staffId);
    if (!coach) return reply.code(404).send({ error: "Coach not found" });
    const summary = await listCoachingSessionNoteSummaryForCoach(db, { staffId });
    const out: CoachingSessionNoteSummaryDto = {
      staffId: coach.id,
      staffName: coach.displayName,
      noteCount: summary.noteCount,
      sessions: summary.sessions.map((s) => ({
        noteId: s.noteId,
        bookingId: s.bookingId,
        recordedAt: s.recordedAt.toISOString(),
      })),
    };
    reply.header("cache-control", CACHE_CONTROL);
    return reply.code(200).send(out);
  });
}
