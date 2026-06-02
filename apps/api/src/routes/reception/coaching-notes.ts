import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { staff, users, type Database } from "@bm/db";
import { validateSession, requirePermission, can, CSRF_HEADER_NAME } from "@bm/auth";
import {
  recordCoachingSessionNote,
  getCoachingSessionNotesForAdmin,
  CoachingSessionNoteBookingNotFoundError,
  CoachingSessionNoteNotCoachingError,
} from "@bm/catalog";
import {
  coachingSessionNoteCreateSchema,
  type CoachingSessionNoteDto,
  type CoachingSessionNoteRecordedDto,
} from "@bm/contracts";
import type { ReceptionDeps } from "./index.js";

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

export interface ReceptionCoachingNotesDeps extends ReceptionDeps {
  /**
   * Master key for the at-rest note encryption (Story 31.4 Dev Note). Reuses the
   * same operator-provisioned material as the Woo secret (`WOO_SECRET_KEY`). When
   * absent the routes are NOT registered — notes cannot be stored unencrypted.
   */
  coachingNoteEncryptionKey?: string;
}

/**
 * PRIVATE coach session notes — record + admin view (P5-E01-S04 / Story 31.4).
 *
 *   POST /reception/coaching/notes        — record a PRIVATE note after check-out (AC1)
 *   GET  /reception/coaching/notes        — admin-only DECRYPTED view (AC2)
 *   GET  /reception/coaching/notes?bookingId=… — the same, scoped to one session
 *
 * SECURITY (AC2/AC3):
 *  - Recording is gated on `create payment` — the SAME permission as salon
 *    completion, which Reception + admin hold (the natural check-out operators).
 *  - The DECRYPTED view is gated on `read audit` — held ONLY by admin/super_admin.
 *    Coaching content is sensitive, so plaintext is reachable on this authenticated
 *    admin path alone; the unauthenticated coach viewer gets a content-free summary.
 *  - There is NO parent surface — parents never see these notes (AC3).
 *
 * The note content is encrypted at rest; the routes are registered only when an
 * encryption key is wired, so a note is never persisted in cleartext.
 */
export function registerReceptionCoachingNotes(
  app: FastifyInstance,
  deps: ReceptionCoachingNotesDeps,
): void {
  const { db, sessions } = deps;
  const masterKey = deps.coachingNoteEncryptionKey;
  if (!masterKey) return;
  const resolveUser = makeResolveUser(db);
  const recordGuard = requirePermission("create", "payment");

  async function authStaff(
    req: FastifyRequest,
    reply: FastifyReply,
    guard?: ReturnType<typeof requirePermission>,
  ): Promise<{ userId: string; role: string } | null> {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    if (guard) {
      const perm = guard(auth.user);
      if (!perm.ok) {
        reply.code(perm.status).send({ error: perm.error });
        return null;
      }
    }
    return { userId: auth.user.id, role: auth.user.role };
  }

  // AC1: record a PRIVATE note for a coaching session after check-out. Reception or
  // admin (both hold `create payment`). The note is encrypted at rest server-side.
  app.post("/reception/coaching/notes", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await authStaff(req, reply, recordGuard);
    if (!ctx) return reply;
    const parsed = coachingSessionNoteCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    try {
      const result = await recordCoachingSessionNote(db, {
        bookingId: parsed.data.bookingId,
        note: parsed.data.note,
        actor: ctx.userId,
        masterKey,
        ip: req.ip,
      });
      const out: CoachingSessionNoteRecordedDto = { id: result.id, bookingId: result.bookingId };
      return reply.code(201).send(out);
    } catch (err) {
      if (err instanceof CoachingSessionNoteBookingNotFoundError) {
        return reply.code(404).send({ error: "Coaching session not found" });
      }
      if (err instanceof CoachingSessionNoteNotCoachingError) {
        return reply.code(409).send({ error: "This booking is not a coaching session" });
      }
      throw err;
    }
  });

  // AC2: DECRYPTED view — admin only (`read audit`). Optionally scoped to a booking.
  app.get("/reception/coaching/notes", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await authStaff(req, reply);
    if (!ctx) return reply;
    // Sensitive decrypt is reserved to admin/super_admin (they alone hold `read audit`).
    if (!can(ctx.role, "read", "audit")) {
      return reply.code(403).send({ error: "Forbidden: missing permission" });
    }
    const q = req.query as { bookingId?: string };
    const rows = await getCoachingSessionNotesForAdmin(db, {
      masterKey,
      ...(q.bookingId ? { bookingId: q.bookingId } : {}),
    });
    // Resolve coach display names for the rows (history-stable snapshot first).
    const staffIds = [...new Set(rows.map((r) => r.staffId).filter((id): id is string => id !== null))];
    const nameById = new Map<string, string>();
    if (staffIds.length) {
      for (const s of await db.select({ id: staff.id, displayName: staff.displayName }).from(staff)) {
        nameById.set(s.id, s.displayName);
      }
    }
    const out: CoachingSessionNoteDto[] = rows.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      staffId: r.staffId,
      staffName: r.staffNameSnapshot ?? (r.staffId ? nameById.get(r.staffId) ?? null : null),
      note: r.note,
      recordedAt: r.createdAt.toISOString(),
      anonymised: r.anonymisedAt !== null,
    }));
    return reply.code(200).send({ notes: out });
  });
}
