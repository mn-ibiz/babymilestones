import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, parents, users, wallets, type Database, type Transaction } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import {
  receptionWalkInSchema,
  type PhoneCheckResult,
} from "@bm/contracts";
import { normalizePhone } from "@bm/auth";
import type { ParentsDeps } from "./index.js";

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

/** Postgres unique-constraint violation (SQLSTATE 23505). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === "23505" || /duplicate key|unique constraint/iu.test(e?.message ?? "");
}

/** Look a normalised phone up and shape the collision result (AC2). */
async function lookupPhone(
  db: Database | Transaction,
  phone: string,
): Promise<PhoneCheckResult> {
  const [user] = await db.select().from(users).where(eq(users.phone, phone));
  if (!user) return { available: true, existing: null };
  const [profile] = await db.select().from(parents).where(eq(parents.userId, user.id));
  return {
    available: false,
    existing: {
      userId: user.id,
      firstName: profile?.firstName ?? null,
      lastName: profile?.lastName ?? null,
    },
  };
}

/**
 * Reception walk-in registration (P1-E02-S02).
 *
 * - GET  /parents/phone-check?phone=…  → live phone-collision lookup (AC2). The
 *   client debounces this at 300ms; the server is the source of truth.
 * - POST /parents/walk-in              → create a walk-in parent on behalf of a
 *   family (AC1, AC3, AC4). No PIN is set (verify-via-OTP on first self-login);
 *   a wallet is auto-provisioned (parity with self-signup); the staff actor is
 *   recorded in the `parent.created_by_reception` audit event.
 *
 * Both require an authenticated staff session with the `create user` permission
 * (held by `reception`, and by `admin`/`super_admin` via `manage`). The mutating
 * verb additionally requires the CSRF double-submit token.
 */
export function registerReceptionWalkIn(app: FastifyInstance, { db, sessions }: ParentsDeps): void {
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("create", "user");

  app.get("/parents/phone-check", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
    const perm = guard(auth.user);
    if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });

    const raw = (req.query as { phone?: string } | undefined)?.phone ?? "";
    const phone = normalizePhone(raw);
    if (!phone) {
      return reply.code(400).send({ error: "Enter a valid Kenyan phone number", field: "phone" });
    }
    const result = await lookupPhone(db, phone);
    return reply.code(200).send(result);
  });

  app.post("/parents/walk-in", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
    const perm = guard(auth.user);
    if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });

    const parsed = receptionWalkInSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const input = parsed.data;

    const phone = normalizePhone(input.phone);
    if (!phone) {
      return reply.code(400).send({ error: "Enter a valid Kenyan phone number", field: "phone" });
    }

    // AC2: a duplicate phone is a conflict — surface the existing reference so
    // the client can offer "Open existing"/"Merge intent" instead of creating.
    const existing = await lookupPhone(db, phone);
    if (!existing.available) {
      return reply
        .code(409)
        .send({ error: "A parent with this phone already exists", existing: existing.existing });
    }

    const staffId = auth.user.id;
    let result: { userId: string };
    try {
      result = await db.transaction(async (tx) => {
        // AC3: no PIN set → pinHash null, pinSetAt null (verify-via-OTP on first
        // self-login). Role defaults to "parent".
        const [user] = await tx.insert(users).values({ phone }).returning();
        // Parity with self-signup: auto-provision the wallet.
        await tx.insert(wallets).values({ userId: user!.id });
        // AC1: the one-screen profile (names required; email/area optional).
        await tx.insert(parents).values({
          userId: user!.id,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          residentialArea: input.residentialArea,
        });
        // AC4: audited with the acting staff user id; never carries a credential.
        await audit(tx, {
          actor: staffId,
          action: "parent.created_by_reception",
          target: { table: "users", id: user!.id },
          payload: {
            staff_user_id: staffId,
            ip: req.ip,
            user_agent: req.headers["user-agent"] ?? null,
          },
        });
        return { userId: user!.id };
      });
    } catch (err) {
      // A check→insert race on the unique phone is a 409 (re-shape the existing
      // reference); anything else is a real failure that must surface.
      if (isUniqueViolation(err)) {
        const dup = await lookupPhone(db, phone);
        return reply
          .code(409)
          .send({ error: "A parent with this phone already exists", existing: dup.existing });
      }
      throw err;
    }

    // No session is created for the walk-in: the parent is NOT logged in here.
    return reply.code(201).send({ userId: result.userId, pinSet: false });
  });
}
