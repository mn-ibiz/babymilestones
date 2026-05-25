import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { asc, eq } from "drizzle-orm";
import { audit, floatAccounts, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import { floatAccountCreateSchema, floatAccountUpdateSchema } from "@bm/contracts";
import type { SessionStore } from "@bm/auth";

export interface FloatAccountsDeps {
  db: Database;
  sessions: SessionStore;
}

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
 * Float-account administration is reserved for treasury (`manage float`) and
 * admin (`manage wallet`) — the roles that own float reconciliation and wallet
 * crediting. This mirrors the bank-transfer guard: a deliberate OR over two
 * rbac grants (no single resource is held by exactly {admin, treasury}).
 */
function canManageFloat(principal: PermissionPrincipal): boolean {
  return can(principal.role, "manage", "float") || can(principal.role, "manage", "wallet");
}

/** Public-facing shape of a float account row (camelCase, dates as ISO strings). */
function serialize(row: typeof floatAccounts.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    openingBalance: row.openingBalance,
    openingDate: row.openingDate,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Float-account CRUD (P1-E06-S01 AC2). Admin/treasury declares the accounts that
 * hold customer wallet float so the liability can be reconciled per account.
 *
 *   GET    /treasury/float-accounts        — list (newest opening first)
 *   POST   /treasury/float-accounts        — create
 *   GET    /treasury/float-accounts/:id    — read one
 *   PATCH  /treasury/float-accounts/:id    — update (name/opening/active; not kind)
 *   DELETE /treasury/float-accounts/:id    — soft-delete (deactivate)
 *
 * Every mutation writes an `audit_outbox` row (DoD). The acting user is the
 * session user — never accepted from the client.
 */
export function registerFloatAccountRoutes(app: FastifyInstance, deps: FloatAccountsDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  /** Authenticate + enforce admin/treasury. Returns the principal or sends an error. */
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
    if (!canManageFloat(auth.user)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  async function loadAccount(id: string) {
    const [row] = await db.select().from(floatAccounts).where(eq(floatAccounts.id, id));
    return row ?? null;
  }

  // AC2: list.
  app.get("/treasury/float-accounts", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const rows = await db
      .select()
      .from(floatAccounts)
      .orderBy(asc(floatAccounts.createdAt));
    return reply.code(200).send({ accounts: rows.map(serialize) });
  });

  // AC1/AC2: create.
  app.post("/treasury/float-accounts", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = floatAccountCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply
        .code(400)
        .send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { name, kind, openingBalance, openingDate } = parsed.data;

    const [row] = await db
      .insert(floatAccounts)
      .values({ name, kind, openingBalance, openingDate })
      .returning();

    await audit(db, {
      actor: actor.id,
      action: "treasury.float_account.create",
      target: { table: "float_accounts", id: row!.id },
      payload: { name, kind, opening_balance: openingBalance, opening_date: openingDate, ip: req.ip },
    });

    return reply.code(201).send(serialize(row!));
  });

  // AC2: read one.
  app.get("/treasury/float-accounts/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const row = await loadAccount(id);
    if (!row) return reply.code(404).send({ error: "Float account not found" });
    return reply.code(200).send(serialize(row));
  });

  // AC2: update (partial — name/opening/active; kind is immutable).
  app.patch("/treasury/float-accounts/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = floatAccountUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply
        .code(400)
        .send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { id } = req.params as { id: string };
    const existing = await loadAccount(id);
    if (!existing) return reply.code(404).send({ error: "Float account not found" });

    const [row] = await db
      .update(floatAccounts)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(floatAccounts.id, id))
      .returning();

    await audit(db, {
      actor: actor.id,
      action: "treasury.float_account.update",
      target: { table: "float_accounts", id },
      payload: { changes: parsed.data, ip: req.ip },
    });

    return reply.code(200).send(serialize(row!));
  });

  // AC2: delete — soft-delete (deactivate) so historical ledger tags keep their
  // FK. A hard delete would orphan reconciliation history.
  app.delete("/treasury/float-accounts/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const existing = await loadAccount(id);
    if (!existing) return reply.code(404).send({ error: "Float account not found" });

    const [row] = await db
      .update(floatAccounts)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(floatAccounts.id, id))
      .returning();

    await audit(db, {
      actor: actor.id,
      action: "treasury.float_account.delete",
      target: { table: "float_accounts", id },
      payload: { soft_delete: true, ip: req.ip },
    });

    return reply.code(200).send(serialize(row!));
  });
}
