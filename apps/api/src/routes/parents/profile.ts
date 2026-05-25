import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, parents, users, type Database, type ParentRow } from "@bm/db";
import {
  validateSession,
  CSRF_HEADER_NAME,
  hashPin,
  verifyPin,
  isWeakPin,
  isValidPinFormat,
  DUMMY_PIN_HASH,
} from "@bm/auth";
import {
  parentProfileSchema,
  smsConsentSchema,
  pinChangeSchema,
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

  // PUT /parents/me/pin — change the authed parent's login PIN (P1-E11-S04 AC3).
  // Requires the CURRENT PIN (re-auth), rejects malformed/weak/duplicate new
  // PINs, rotates the argon2 hash, invalidates every existing session, and
  // audits the change. The raw PIN is never logged or echoed.
  app.put("/parents/me/pin", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });

    const parsed = pinChangeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid PIN change", field: first?.path[0] });
    }
    const { currentPin, newPin } = parsed.data;

    // Defensive: format + weakness (the schema enforces format, but be explicit
    // so a weak-but-well-formed new PIN is rejected like signup/reset).
    if (!isValidPinFormat(newPin)) {
      return reply.code(400).send({ field: "newPin", error: "New PIN must be 4 digits" });
    }
    if (isWeakPin(newPin)) {
      return reply.code(400).send({ field: "newPin", error: "Choose a less predictable PIN" });
    }

    const userId = auth.user.id;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return reply.code(404).send({ error: "User not found" });

    // AC3: verify the CURRENT PIN before rotating. Argon2 verify always runs
    // (against a dummy hash when no PIN is set) so the failure path keeps the
    // same timing regardless of account state.
    const matches = await verifyPin(user.pinHash ?? DUMMY_PIN_HASH, currentPin);
    if (!matches) {
      return reply.code(400).send({ field: "currentPin", error: "Current PIN is incorrect" });
    }

    const pinHash = await hashPin(newPin);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ pinHash }).where(eq(users.id, userId));
      // DoD#4: audited. Never store the raw PIN (only that a change happened).
      await audit(tx, {
        actor: userId,
        action: "parent.pin.change",
        target: { table: "users", id: userId },
        payload: { ip: req.ip, user_agent: req.headers["user-agent"] ?? null },
      });
    });

    // Invalidate every existing session so a leaked cookie can't survive the
    // re-auth event (mirrors auth.reset.completed).
    await sessions.destroyAllForUser(userId);

    return reply.code(200).send({ ok: true });
  });
}
