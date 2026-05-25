import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import {
  audit,
  bookings,
  children,
  invoices,
  parents,
  users,
  wallets,
  type Database,
} from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import {
  recordVisitSchema,
  isVisitOutstanding,
  type RecordVisitResponse,
  type VisitDebitOutcome,
} from "@bm/contracts";
import { debit } from "@bm/wallet";
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

/** Joined parent identity + wallet, keyed on the parent's user id. */
interface ParentRecord {
  parentId: string;
  walletId: string;
}

async function loadParent(db: Database, userId: string): Promise<ParentRecord | null> {
  const [profile] = await db.select().from(parents).where(eq(parents.userId, userId));
  if (!profile) return null;
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (!wallet) return null;
  return { parentId: profile.id, walletId: wallet.id };
}

/**
 * Record a service visit (P1-E05-S04).
 *
 * POST /reception/visit — Reception records that a child attended a service,
 * attributes it to a staff member, and lets the system handle payment. In one
 * flow the server:
 *  1. creates a pending `invoices` row for the service rate (AC3),
 *  2. creates a `bookings` row with the staff name + rate SNAPSHOTTED (AC2) and
 *     marks it checked-in immediately (AC3),
 *  3. runs the check-in debit (`@bm/wallet` debit, P1-E03-S05) against that
 *     invoice — settled when funded; `settled_on_credit` when auto-credit covers
 *     an overdraw; `outstanding` (no debit, booking still proceeds) when the
 *     wallet is short and auto-credit is off (AC4).
 *
 * Staff-only via rbac `create payment` (Reception + Cashier hold it; admin,
 * accountant, packer, treasury do not → 403). The mutating verb requires the
 * CSRF double-submit token. The wallet + parent profile are derived server-side
 * from `parentId` (the parent's *user* id) — never trusted from the client; the
 * staff actor is the session user (`posted_by`/`actor`), never the body. The
 * child must belong to the parent (else 422). One `reception.record_visit` audit
 * row is written (the debit primitive also writes its own `wallet.checkin_debit`).
 *
 * The services + staff catalogues are a later epic (P1-E07); for now the client
 * sends opaque `serviceId`/`staffId` plus the snapshot fields directly. DEFERRED:
 * load active-only services/staff from the P1-E07 catalogue and snapshot the
 * name + rate server-side once that epic ships.
 */
export function registerRecordVisit(app: FastifyInstance, deps: ReceptionDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("create", "payment");

  app.post("/reception/visit", async (req: FastifyRequest, reply: FastifyReply) => {
    const authResult = await validateSession(
      {
        method: req.method,
        cookieHeader: req.headers.cookie ?? null,
        csrfHeader: csrfHeaderOf(req),
      },
      { sessions, resolveUser },
    );
    if (!authResult.ok) return reply.code(authResult.status).send({ error: authResult.error });
    const perm = guard(authResult.user);
    if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });

    const parsed = recordVisitSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply
        .code(400)
        .send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { parentId, childId, serviceId, staffId, staffName, rate, idempotencyKey } = parsed.data;
    const staffActor = authResult.user.id;

    const parent = await loadParent(db, parentId);
    if (!parent) return reply.code(404).send({ error: "Parent not found" });

    // The child must belong to this parent (never bill a stranger's child).
    const [child] = await db.select().from(children).where(eq(children.id, childId));
    if (!child || child.parentId !== parent.parentId) {
      return reply.code(422).send({ error: "Child does not belong to this parent" });
    }

    // 1) + 2) Create the pending invoice + the checked-in booking together, then
    // 3) run the check-in debit. The invoice/booking creation is atomic; the
    // debit (P1-E03-S05) is itself transactional and resolves the invoice.
    const { invoiceId, bookingId } = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .insert(invoices)
        .values({ parentId: parent.parentId, amountDue: rate, serviceId, status: "pending" })
        .returning();
      const [booking] = await tx
        .insert(bookings)
        .values({
          parentId: parent.parentId,
          childId,
          serviceId,
          staffId,
          staffNameSnapshot: staffName,
          staffRateSnapshot: rate,
          invoiceId: invoice!.id,
        })
        .returning();
      return { invoiceId: invoice!.id, bookingId: booking!.id };
    });

    const result = await debit(db, {
      walletId: parent.walletId,
      invoiceId,
      idempotencyKey: idempotencyKey ?? `reception:visit:${bookingId}`,
      source: "checkin",
      postedBy: staffActor,
    });

    const outcome = result.outcome as VisitDebitOutcome;
    const warning = isVisitOutstanding(outcome);

    await audit(db, {
      actor: staffActor,
      action: "reception.record_visit",
      target: { table: "bookings", id: bookingId },
      payload: {
        parent_id: parentId,
        child_id: childId,
        service_id: serviceId,
        staff_id: staffId,
        invoice_id: invoiceId,
        rate,
        outcome,
        debited: result.debited,
        ip: req.ip,
        user_agent: req.headers["user-agent"] ?? null,
      },
    });

    const out: RecordVisitResponse = {
      bookingId,
      invoiceId,
      outcome,
      debitedCents: result.debited,
      warning,
      warningMessage: warning
        ? "Wallet balance was insufficient and auto-credit is off — the visit is recorded and an outstanding amount was created."
        : null,
    };
    return reply.code(201).send(out);
  });
}
