import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { invoices, parents, users, wallets, walletLedger, type Database } from "@bm/db";
import { normalizePhone, validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import { balances } from "@bm/wallet";
import {
  parentSearchQuerySchema,
  PARENT_SEARCH_MIN_QUERY,
  PARENT_SEARCH_LIMIT,
  type ParentSearchResult,
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

/** Escape ILIKE wildcards in user input so `%`/`_` are matched literally. */
function escapeLike(term: string): string {
  return term.replace(/([%_\\])/gu, "\\$1");
}

interface ParentMatch {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/**
 * Find parents by a free-text query (P1-E05-S01). Matches EITHER:
 *  - phone: the query normalised to +2547XXXXXXXX → exact or prefix on
 *    `users.phone` (which is stored already normalised). A partial phone (e.g.
 *    "0712" / "+254712") is normalisable only when complete, so we also do a
 *    prefix LIKE against the normalised stored value for partial digit input.
 *  - name: case-insensitive substring (ILIKE '%term%') on first OR last name.
 *    Backed by the trigram index in prod (btree fallback under PGlite).
 *
 * Pure-ish query layer (no Fastify) so it is exercised directly by integration
 * tests against the PGlite harness. Returns at most {@link PARENT_SEARCH_LIMIT}
 * matched parents (id/name/phone); the route shapes balances + visits on top.
 */
export async function findParents(db: Database, rawQuery: string): Promise<ParentMatch[]> {
  const q = rawQuery.trim();
  if (q.length < PARENT_SEARCH_MIN_QUERY) return [];

  const nameTerm = `%${escapeLike(q)}%`;
  const conditions = [
    sql`${parents.firstName} ILIKE ${nameTerm}`,
    sql`${parents.lastName} ILIKE ${nameTerm}`,
  ];

  // Phone matching: digits-only forms (e.g. "0712…", "+254712…", "712…") map to
  // the normalised stored phone. A fully valid phone normalises to an exact
  // value; otherwise treat the digit run as a prefix against the stored phone.
  const digits = q.replace(/[^\d+]/gu, "");
  if (digits.length >= 3) {
    const normalised = normalizePhone(q);
    if (normalised) {
      conditions.push(eq(users.phone, normalised));
    }
    // Prefix match on the normalised stored phone for partial digit input.
    // "0712" → "+254712" prefix; "+254712" / "254712" → as-is suffix digits.
    let prefix = digits;
    if (prefix.startsWith("0")) prefix = `+254${prefix.slice(1)}`;
    else if (prefix.startsWith("+")) prefix = digits;
    else if (prefix.startsWith("254")) prefix = `+${prefix}`;
    else prefix = `+254${prefix}`;
    conditions.push(sql`${users.phone} LIKE ${`${escapeLike(prefix)}%`}`);
  }

  const rows = await db
    .select({
      userId: users.id,
      firstName: parents.firstName,
      lastName: parents.lastName,
      phone: users.phone,
    })
    .from(parents)
    .innerJoin(users, eq(parents.userId, users.id))
    .where(or(...conditions))
    .limit(PARENT_SEARCH_LIMIT);

  return rows;
}

/** Last 4 digits of a normalised phone (never expose the full number in a list). */
function last4(phone: string): string {
  return phone.slice(-4);
}

/**
 * Shape matched parents into the full search result (AC3): wallet balance,
 * outstanding owed, last visit. Balances + visits + invoices are fetched in
 * batched queries (one each) so the response stays fast at the 10k fixture
 * scale — no per-row N+1.
 */
async function shapeResults(db: Database, matches: ParentMatch[]): Promise<ParentSearchResult[]> {
  if (matches.length === 0) return [];
  const userIds = matches.map((m) => m.userId);

  // Wallets for these users → wallet id ↔ user id, then batched balances.
  const walletRows = await db
    .select({ id: wallets.id, userId: wallets.userId })
    .from(wallets)
    .where(inArray(wallets.userId, userIds));
  const walletIdByUser = new Map(walletRows.map((w) => [w.userId, w.id]));
  const balanceByWallet = await balances(
    db,
    walletRows.map((w) => w.id),
  );

  // Last visit per wallet: most recent check-in debit posting.
  const visitRows =
    walletRows.length === 0
      ? []
      : await db
          .select({
            walletId: walletLedger.walletId,
            lastVisit: sql<string | null>`MAX(${walletLedger.createdAt})`,
          })
          .from(walletLedger)
          .where(
            and(
              inArray(
                walletLedger.walletId,
                walletRows.map((w) => w.id),
              ),
              eq(walletLedger.source, "checkin"),
            ),
          )
          .groupBy(walletLedger.walletId);
  const lastVisitByWallet = new Map(visitRows.map((r) => [r.walletId, r.lastVisit]));

  // Outstanding owed per parent: sum of open (non-settled) invoices, keyed on
  // parents.id. Resolve parent profile ids for these users first.
  const parentRows = await db
    .select({ id: parents.id, userId: parents.userId })
    .from(parents)
    .where(inArray(parents.userId, userIds));
  const parentIdByUser = new Map(parentRows.map((p) => [p.userId, p.id]));
  const parentIds = parentRows.map((p) => p.id);
  const outstandingRows =
    parentIds.length === 0
      ? []
      : await db
          .select({
            parentId: invoices.parentId,
            owed: sql<string>`COALESCE(SUM(${invoices.amountDue}), 0)`,
          })
          .from(invoices)
          .where(
            and(inArray(invoices.parentId, parentIds), sql`${invoices.status} <> 'settled'`),
          )
          .groupBy(invoices.parentId);
  const outstandingByParent = new Map(outstandingRows.map((r) => [r.parentId, Number(r.owed)]));

  return matches.map((m) => {
    const walletId = walletIdByUser.get(m.userId);
    const parentId = parentIdByUser.get(m.userId);
    const lastVisit = walletId ? (lastVisitByWallet.get(walletId) ?? null) : null;
    return {
      userId: m.userId,
      firstName: m.firstName,
      lastName: m.lastName,
      phoneLast4: last4(m.phone),
      walletBalanceCents: walletId ? (balanceByWallet.get(walletId) ?? 0) : 0,
      outstandingCents: parentId ? (outstandingByParent.get(parentId) ?? 0) : 0,
      lastVisitAt: lastVisit ? new Date(lastVisit).toISOString() : null,
    };
  });
}

/**
 * Reception parent search (P1-E05-S01).
 *
 * GET /reception/parents/search?q=… — staff find a parent by phone (any format,
 * exact/prefix) or partial name (case-insensitive substring). Results carry name,
 * phone last-4, wallet balance, outstanding owed, and last visit date (AC3),
 * capped at PARENT_SEARCH_LIMIT. Read-only — no audit/SMS.
 *
 * Guarded to `read wallet`, which front-desk roles (reception, cashier,
 * accountant, admin) hold; packer/treasury do NOT and are rejected (staff-only).
 */
export function registerParentSearch(app: FastifyInstance, { db, sessions }: ReceptionDeps): void {
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("read", "wallet");

  app.get("/reception/parents/search", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      {
        method: req.method,
        cookieHeader: req.headers.cookie ?? null,
        csrfHeader: csrfHeaderOf(req),
      },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
    const perm = guard(auth.user);
    if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });

    const query = (req.query ?? {}) as Record<string, unknown>;
    const parsed = parentSearchQuerySchema.safeParse({ q: query.q ?? "" });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid query", field: first?.path[0] });
    }

    const matches = await findParents(db, parsed.data.q);
    const results = await shapeResults(db, matches);
    return reply.code(200).send({ results });
  });
}
