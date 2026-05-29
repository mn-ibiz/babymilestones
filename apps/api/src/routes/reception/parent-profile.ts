import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, asc, eq, sql } from "drizzle-orm";
import { invoices, parents, users, wallets, type Database } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import { balance } from "@bm/wallet";
import type {
  ParentProfileSummary,
  OpenInvoice,
} from "@bm/contracts";
import type { ReceptionDeps } from "./index.js";

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

/** Joined identity + wallet row for a parent, keyed on the user id. */
interface ParentRecord {
  userId: string;
  parentId: string;
  walletId: string;
  firstName: string;
  lastName: string;
  phone: string;
  autoCreditEnabled: boolean;
}

/**
 * Load one parent's identity + wallet by user id. Returns null when the user is
 * not a parent or has no wallet (a 404 to the caller). Pure-ish query layer (no
 * Fastify) so the integration tests exercise it directly via the route.
 */
export async function loadParentRecord(
  db: Database,
  userId: string,
): Promise<ParentRecord | null> {
  const [row] = await db
    .select({
      userId: users.id,
      parentId: parents.id,
      walletId: wallets.id,
      firstName: parents.firstName,
      lastName: parents.lastName,
      phone: users.phone,
      autoCreditEnabled: wallets.autoCreditEnabled,
    })
    .from(parents)
    .innerJoin(users, eq(parents.userId, users.id))
    .innerJoin(wallets, eq(wallets.userId, users.id))
    .where(eq(users.id, userId));
  return row ?? null;
}

/** Sum of open (non-settled) invoice amounts owed for a parent, in cents. */
export async function outstandingForParent(db: Database, parentId: string): Promise<number> {
  const [row] = await db
    .select({ owed: sql<string>`COALESCE(SUM(${invoices.amountDue}), 0)` })
    .from(invoices)
    .where(and(eq(invoices.parentId, parentId), sql`${invoices.status} NOT IN ('settled', 'void')`));
  return Number(row?.owed ?? 0);
}

/**
 * Shape a parent's profile-header summary (AC1): name, full phone, computed
 * wallet balance, outstanding owed (sum of open invoices), and the auto-credit
 * flag. Balance comes from `@bm/wallet` (SUM over the ledger — never stored).
 */
export async function shapeProfileSummary(
  db: Database,
  rec: ParentRecord,
): Promise<ParentProfileSummary> {
  const [walletBalanceCents, outstandingCents] = await Promise.all([
    balance(db, rec.walletId),
    outstandingForParent(db, rec.parentId),
  ]);
  return {
    userId: rec.userId,
    firstName: rec.firstName,
    lastName: rec.lastName,
    phone: rec.phone,
    walletBalanceCents,
    outstandingCents,
    autoCreditEnabled: rec.autoCreditEnabled,
  };
}

/** Open (non-settled) invoices for a parent, oldest-first (FIFO order, AC3). */
export async function openInvoicesForParent(
  db: Database,
  parentId: string,
): Promise<OpenInvoice[]> {
  const rows = await db
    .select({
      id: invoices.id,
      amountDue: invoices.amountDue,
      status: invoices.status,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(and(eq(invoices.parentId, parentId), sql`${invoices.status} NOT IN ('settled', 'void')`))
    .orderBy(asc(invoices.createdAt));
  return rows.map((r) => ({
    id: r.id,
    amountDueCents: Number(r.amountDue),
    status: r.status,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

/**
 * Reception parent-profile header (P1-E05-S02).
 *
 * GET /reception/parents/:userId/profile        — header summary facts (AC1).
 * GET /reception/parents/:userId/open-invoices  — open invoices for the modal (AC3).
 *
 * Both are read-only and guarded to `read wallet`, which front-desk roles
 * (reception, cashier, accountant, admin) hold; packer/treasury do NOT and are
 * rejected (staff-only). The auto-credit toggle itself is mutated via the
 * admin-only `PATCH /admin/parents/:userId/auto-credit` route (P1-E03-S07).
 */
export function registerParentProfile(app: FastifyInstance, { db, sessions }: ReceptionDeps): void {
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("read", "wallet");

  async function authorize(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
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
      return false;
    }
    const perm = guard(auth.user);
    if (!perm.ok) {
      reply.code(perm.status).send({ error: perm.error });
      return false;
    }
    return true;
  }

  app.get("/reception/parents/:userId/profile", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await authorize(req, reply))) return reply;
    const { userId } = req.params as { userId: string };
    const rec = await loadParentRecord(db, userId);
    if (!rec) return reply.code(404).send({ error: "Parent not found" });
    const profile = await shapeProfileSummary(db, rec);
    return reply.code(200).send({ profile });
  });

  app.get(
    "/reception/parents/:userId/open-invoices",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!(await authorize(req, reply))) return reply;
      const { userId } = req.params as { userId: string };
      const rec = await loadParentRecord(db, userId);
      if (!rec) return reply.code(404).send({ error: "Parent not found" });
      const list = await openInvoicesForParent(db, rec.parentId);
      const totalCents = list.reduce((sum, inv) => sum + inv.amountDueCents, 0);
      return reply.code(200).send({ invoices: list, totalCents });
    },
  );
}
