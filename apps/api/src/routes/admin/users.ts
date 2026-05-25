import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database, type UserRow } from "@bm/db";
import {
  CSRF_HEADER_NAME,
  generatePin,
  hashPin,
  invalidateSessionsOnRoleChange,
  isStaffRole,
  isWeakPin,
  normalizePhone,
  requirePermission,
  validateSession,
  type PermissionPrincipal,
  type SessionStore,
} from "@bm/auth";
import { adminUserCreateSchema, adminUserUpdateSchema } from "@bm/contracts";

export interface AdminUsersDeps {
  db: Database;
  sessions: SessionStore;
}

const guard = requirePermission("manage", "user");

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

/**
 * Public shape of a staff login user. NEVER includes `pinHash` — the PIN (raw or
 * hashed) is never echoed back to any client (AC: no PIN leakage).
 */
function serialize(row: UserRow): {
  id: string;
  phone: string;
  role: string;
  active: boolean;
  deactivatedAt: string | null;
  createdAt: string;
} {
  return {
    id: row.id,
    phone: row.phone,
    role: row.role,
    active: row.deactivatedAt === null,
    deactivatedAt: row.deactivatedAt ? row.deactivatedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Staff login-user administration (P1-E10-S02). Manages the `users` rows that
 * authenticate into the consoles (phone + role + PIN) — DISTINCT from the
 * attribution `staff` data records (P1-E07-S03, `/admin/staff`). Reserved to
 * roles holding `manage user` (admin / super_admin); enforced server-side.
 *
 *   GET    /admin/users               — list staff login users (no parents)
 *   POST   /admin/users               — create a staff login (phone/role/PIN, AC1)
 *   PATCH  /admin/users/:id            — change role and/or active flag (AC2)
 *   POST   /admin/users/:id/reset-pin  — issue a fresh one-time PIN (AC3)
 *
 * Security-critical side effects, all server-side and audited (AC4):
 *  - the raw/initial PIN is hashed with `hashPin` and returned ONCE on the
 *    create/reset response; it is never stored in plaintext or logged;
 *  - a role change invalidates the user's live sessions (1-6 AC4) so the new
 *    role takes effect immediately and a downgrade cannot keep elevated access;
 *  - a deactivation soft-disables the account (stamps `deactivatedAt`, blocks
 *    the staff-login flow) AND destroys its live sessions.
 */
export function registerAdminUsers(app: FastifyInstance, deps: AdminUsersDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  async function authorize(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<PermissionPrincipal | null> {
    const auth = await validateSession(
      {
        method: req.method,
        cookieHeader: req.headers.cookie ?? null,
        csrfHeader: csrfHeaderOf(req),
      },
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
    return { id: auth.user.id, role: auth.user.role };
  }

  /** Load a staff login user by id, 404 (and reply) if missing OR a parent. */
  async function loadStaffUser(id: string, reply: FastifyReply): Promise<UserRow | null> {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    // A parent is not a staff login user — this surface never manages parents.
    if (!row || !isStaffRole(row.role)) {
      reply.code(404).send({ error: "Staff user not found" });
      return null;
    }
    return row;
  }

  // List staff login users (parents excluded). Read-only — never leaks PIN hash.
  app.get("/admin/users", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const rows = await db.select().from(users);
    const staff = rows
      .filter((r) => isStaffRole(r.role))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return reply.code(200).send({ users: staff.map(serialize) });
  });

  // Create a staff login user (AC1).
  app.post("/admin/users", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const parsed = adminUserCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const phone = normalizePhone(parsed.data.phone);
    if (!phone) {
      return reply.code(400).send({ error: "Enter a valid Kenyan phone number", field: "phone" });
    }
    // Explicit PIN must pass the weak-PIN policy; otherwise auto-generate a
    // strong one we return once for the super-admin to relay.
    if (parsed.data.pin !== undefined && isWeakPin(parsed.data.pin)) {
      return reply.code(400).send({ error: "PIN is too predictable", field: "pin" });
    }
    const initialPin = parsed.data.pin ?? generatePin();

    const [existing] = await db.select().from(users).where(eq(users.phone, phone));
    if (existing) {
      return reply.code(409).send({ error: "A user with that phone already exists", field: "phone" });
    }

    const pinHash = await hashPin(initialPin);
    const [row] = await db
      .insert(users)
      .values({ phone, role: parsed.data.role, pinHash, pinSetAt: new Date() })
      .returning();

    await audit(db, {
      actor: actor.id,
      action: "admin.user.create",
      target: { table: "users", id: row!.id },
      // Records phone + role only — never the PIN or its hash.
      payload: { phone, role: parsed.data.role, ip: req.ip },
    });
    // The initial PIN is returned ONCE (shown on-screen to the super-admin, AC1).
    return reply.code(201).send({ ...serialize(row!), initialPin });
  });

  // Edit: change role and/or active flag (AC2).
  app.patch("/admin/users/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const parsed = adminUserUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { id } = req.params as { id: string };
    const existing = await loadStaffUser(id, reply);
    if (!existing) return reply;

    const { role, active } = parsed.data;
    const updates: Partial<{ role: string; deactivatedAt: Date | null }> = {};
    const roleChanged = role !== undefined && role !== existing.role;
    if (roleChanged) updates.role = role;

    const wasActive = existing.deactivatedAt === null;
    const activeChanged = active !== undefined && active !== wasActive;
    if (activeChanged) updates.deactivatedAt = active ? null : new Date();

    let row = existing;
    if (Object.keys(updates).length > 0) {
      [row] = (await db.update(users).set(updates).where(eq(users.id, id)).returning()) as [UserRow];
    }

    // Security-critical side effects (1-6 AC4): a role change OR a deactivation
    // destroys the user's live sessions so the change takes effect immediately.
    if (roleChanged || (activeChanged && active === false)) {
      await invalidateSessionsOnRoleChange(sessions, id);
    }

    await audit(db, {
      actor: actor.id,
      action: "admin.user.update",
      target: { table: "users", id },
      payload: {
        ...(roleChanged ? { role_before: existing.role, role_after: role } : {}),
        ...(activeChanged ? { active_before: wasActive, active_after: active } : {}),
        sessions_invalidated: roleChanged || (activeChanged && active === false),
        ip: req.ip,
      },
    });
    return reply.code(200).send(serialize(row));
  });

  // Reset PIN: issue a fresh one-time PIN, shown on-screen (AC3). Invalidates
  // the user's live sessions so the old PIN's sessions cannot be reused.
  app.post("/admin/users/:id/reset-pin", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const existing = await loadStaffUser(id, reply);
    if (!existing) return reply;

    const newPin = generatePin();
    const pinHash = await hashPin(newPin);
    await db.update(users).set({ pinHash, pinSetAt: new Date() }).where(eq(users.id, id));
    await invalidateSessionsOnRoleChange(sessions, id);

    await audit(db, {
      actor: actor.id,
      action: "admin.user.reset_pin",
      target: { table: "users", id },
      // Never records the PIN or its hash.
      payload: { sessions_invalidated: true, ip: req.ip },
    });
    return reply.code(200).send({ initialPin: newPin });
  });
}
