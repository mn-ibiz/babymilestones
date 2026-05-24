import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, parents, users, type Database, type ParentRow } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import {
  parentProfileSchema,
  smsConsentSchema,
  isProfileComplete,
  type ParentProfile,
} from "@bm/contracts";
import type { ParentsDeps } from "./index.js";

/** Map a stored row to the API/contract shape. */
function toProfile(row: ParentRow): ParentProfile {
  return {
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    residentialArea: row.residentialArea,
    smsMarketingOptIn: row.smsMarketingOptIn,
  };
}

/** Resolve a session's userId to its live role (parent surface needs role check). */
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

/**
 * Parent profile routes (P1-E02-S01).
 * - GET  /parents/me  → the authed user's profile (or { profile: null }) + completion flag (AC3, AC4).
 * - PUT  /parents/me  → create-or-update (upsert) the authed user's profile (AC1, AC2, AC4); audited.
 *
 * Auth is enforced via the shared session guard; the mutating verb also requires
 * the CSRF double-submit token. The user can only ever read/write their OWN
 * profile (the userId comes from the session, never the body).
 */
export function registerParentProfile(app: FastifyInstance, { db, sessions }: ParentsDeps): void {
  const resolveUser = makeResolveUser(db);

  app.get("/parents/me", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });

    const [row] = await db.select().from(parents).where(eq(parents.userId, auth.user.id));
    const profile = row ? toProfile(row) : null;
    // AC3: the client shows the completion banner until this is true.
    return reply.code(200).send({ profile, complete: isProfileComplete(profile) });
  });

  app.put("/parents/me", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });

    // AC2: validate (required names + permissive email). Optionals collapse to null.
    const parsed = parentProfileSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid profile", field: first?.path[0] });
    }
    const input = parsed.data;
    const userId = auth.user.id;

    const profile = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(parents).where(eq(parents.userId, userId));
      let row: ParentRow;
      if (existing) {
        // AC4: edit in place.
        const [updated] = await tx
          .update(parents)
          .set({
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            residentialArea: input.residentialArea,
            updatedAt: new Date(),
          })
          .where(eq(parents.userId, userId))
          .returning();
        row = updated!;
      } else {
        // AC1: create the inline profile.
        const [created] = await tx
          .insert(parents)
          .values({
            userId,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            residentialArea: input.residentialArea,
          })
          .returning();
        row = created!;
      }
      // DoD #4: audited action (no sensitive payload).
      await audit(tx, {
        actor: userId,
        action: existing ? "parent.profile.update" : "parent.profile.create",
        target: { table: "parents", id: row.id },
        payload: { ip: req.ip, user_agent: req.headers["user-agent"] ?? null },
      });
      return toProfile(row);
    });

    // PUT is an idempotent upsert → always 200 with the current profile.
    return reply.code(200).send({ profile, complete: isProfileComplete(profile) });
  });

  // PUT /parents/me/consent/sms — toggle the parent's SMS marketing opt-in
  // (P1-E02-S04 AC1, AC2). Scoped to the session's own profile; the change is
  // audited with a timestamp (consent is compliance-sensitive — AC2).
  app.put("/parents/me/consent/sms", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });

    const parsed = smsConsentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid consent", field: first?.path[0] });
    }
    const { smsMarketingOptIn } = parsed.data;
    const userId = auth.user.id;

    const profile = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(parents).where(eq(parents.userId, userId));
      if (!existing) return null;
      const [updated] = await tx
        .update(parents)
        .set({ smsMarketingOptIn, updatedAt: new Date() })
        .where(eq(parents.userId, userId))
        .returning();
      // AC2: log the consent change with a timestamp. audit_outbox rows carry
      // their own created_at; we also stamp the new value + when into payload.
      await audit(tx, {
        actor: userId,
        action: "parent.consent.sms",
        target: { table: "parents", id: updated!.id },
        payload: {
          sms_marketing_opt_in: smsMarketingOptIn,
          at: new Date().toISOString(),
          ip: req.ip,
          user_agent: req.headers["user-agent"] ?? null,
        },
      });
      return toProfile(updated!);
    });

    if (!profile) return reply.code(404).send({ error: "Parent profile not found" });
    return reply.code(200).send({ profile, complete: isProfileComplete(profile) });
  });
}
