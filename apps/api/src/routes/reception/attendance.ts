import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
  attendances,
  audit,
  bookings,
  children,
  invoices,
  parents,
  services,
  sessionSlots,
  users,
  wallets,
  type Database,
} from "@bm/db";
import { validateSession, requirePermission, isStaffRole, CSRF_HEADER_NAME } from "@bm/auth";
import { debit, DoubleCheckInError, recordBookingCommission } from "@bm/wallet";
import {
  attendanceBulkCheckInSchema,
  attendanceCheckInSchema,
  isCheckInOutstanding,
  type AttendanceBookingCard,
  type AttendanceBulkResultItem,
  type AttendanceCheckInResult,
  type AttendanceSlot,
  type CheckInOutcome,
} from "@bm/contracts";
import type { ReceptionDeps } from "./index.js";

/** Canonical UUID shape, for validating path params before they reach a uuid column. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/* --- Check-in orchestration (reused by S03 hand-off + tests) ------------- */

export class BookingNotFoundError extends Error {
  constructor() {
    super("Booking not found");
    this.name = "BookingNotFoundError";
  }
}
export class BookingCancelledError extends Error {
  constructor() {
    super("Booking is cancelled");
    this.name = "BookingCancelledError";
  }
}
export class AlreadyCheckedInError extends Error {
  constructor() {
    super("Child is already checked in");
    this.name = "AlreadyCheckedInError";
  }
}

/** SQLSTATE 23505 unique-constraint violation (the attendances booking_id fence). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    e?.code === "23505" ||
    (typeof e?.message === "string" &&
      /duplicate key|unique constraint|attendances_booking_id_uniq/iu.test(e.message))
  );
}

export interface CheckInInput {
  bookingId: string;
  /** ISO drop-off timestamp (AC2). Optional. */
  droppedOffAt?: string | null;
  /** Acting staff user id. */
  actor: string;
  ip?: string | null;
}

/** Map a non-pending invoice status to the check-in outcome it already reached. */
function outcomeFromInvoiceStatus(status: string): CheckInOutcome {
  if (status === "settled" || status === "settled_on_credit" || status === "outstanding") {
    return status;
  }
  // `void` (cancelled booking — guarded earlier) or anything unexpected: treat as
  // already resolved with no charge.
  return "covered";
}

/**
 * Settle the wallet side of a wallet-paid booking (P1-E03-S05). Returns the
 * outcome + cents debited. The debit runs FIRST (before the attendance row) and
 * is idempotent on `attendance:checkin:<bookingId>` — so a crash between the
 * charge and the attendance insert never loses the charge (a retry replays the
 * debit as a no-op, then records the attendance). An invoice that is already
 * non-pending (e.g. FIFO-settled by a later top-up, or a prior `outstanding`
 * check-in) is resolved from its status rather than throwing.
 */
async function settleWalletBooking(
  db: Database,
  booking: { id: string; parentId: string; invoiceId: string },
  actor: string,
): Promise<{ outcome: CheckInOutcome; debitedCents: number }> {
  const [parent] = await db.select().from(parents).where(eq(parents.id, booking.parentId));
  const [wallet] = parent ? await db.select().from(wallets).where(eq(wallets.userId, parent.userId)) : [];
  if (!wallet) {
    // No wallet to debit (effectively dead — wallets auto-provision at signup).
    return { outcome: "outstanding", debitedCents: 0 };
  }
  try {
    const result = await debit(db, {
      walletId: wallet.id,
      invoiceId: booking.invoiceId,
      idempotencyKey: `attendance:checkin:${booking.id}`,
      source: "checkin",
      postedBy: actor,
    });
    return { outcome: result.outcome as CheckInOutcome, debitedCents: result.debited };
  } catch (err) {
    // A check-in debit already settled this invoice (distinct key) → already paid.
    if (err instanceof DoubleCheckInError) return { outcome: "settled", debitedCents: 0 };
    // Raced to non-pending between our read and the lock (e.g. a top-up settled
    // it): resolve from the now-current status instead of failing the check-in.
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, booking.invoiceId));
    if (inv && inv.status !== "pending") {
      return { outcome: outcomeFromInvoiceStatus(inv.status), debitedCents: 0 };
    }
    throw err;
  }
}

/**
 * Check a child in for a booked slot (P2-E03-S02 AC3). Resolves payment FIRST
 * (idempotent wallet debit for wallet bookings; subscription bookings are
 * pre-covered by entitlement → `covered`, no debit), THEN records an
 * `attendances` row (one per booking — the UNIQUE index fences a double check-in,
 * surfaced as a 409). Ordering payment-before-attendance makes a crash safe: the
 * charge is idempotently retryable and is never stranded behind the attendance
 * fence. An underfunded wallet with auto-credit off resolves `outstanding` — the
 * child is still checked in (the booking proceeds).
 *
 * Throws {@link BookingNotFoundError} / {@link BookingCancelledError} /
 * {@link AlreadyCheckedInError}.
 */
export async function checkInBooking(
  db: Database,
  input: CheckInInput,
): Promise<AttendanceCheckInResult> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId));
  if (!booking) throw new BookingNotFoundError();
  if (booking.status === "cancelled") throw new BookingCancelledError();

  // 1) Resolve payment first (retryable / idempotent) so a crash before the
  //    attendance insert never loses the charge.
  const { outcome, debitedCents } =
    booking.paidVia === "subscription"
      ? { outcome: "covered" as CheckInOutcome, debitedCents: 0 }
      : await settleWalletBooking(db, booking, input.actor);

  // 2) Record the attendance + audit atomically. The booking_id UNIQUE index
  //    makes a concurrent / repeat check-in fail (23505) → AlreadyCheckedInError.
  const droppedOffAt = input.droppedOffAt ? new Date(input.droppedOffAt) : null;
  let attendanceId: string;
  try {
    attendanceId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(attendances)
        .values({ bookingId: input.bookingId, droppedOffAt, checkedInBy: input.actor })
        .returning();
      await audit(tx, {
        actor: input.actor,
        action: "attendance.checked_in",
        target: { table: "attendances", id: row!.id },
        payload: {
          booking_id: input.bookingId,
          child_id: booking.childId,
          slot_id: booking.slotId,
          dropped_off_at: droppedOffAt?.toISOString() ?? null,
          outcome,
          ip: input.ip ?? undefined,
        },
      });
      return row!.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AlreadyCheckedInError();
    throw err;
  }

  // Commission accrual (P3-E01-S02): the attributed staff member's commission line
  // for this settled booking. The hook fires on booking settle (wallet debit on
  // check-in OR subscription consumption); it is idempotent + self-skipping
  // (unattributed / no-rate), so it is a no-op when no staff is attributed.
  await recordBookingCommission(db, { bookingId: input.bookingId, postedBy: input.actor });

  return {
    bookingId: input.bookingId,
    attendanceId,
    outcome,
    debitedCents,
    warning: isCheckInOutstanding(outcome),
  };
}

/* --- Routes -------------------------------------------------------------- */

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
 * Attendant check-in screen (P2-E03-S02), operated via Reception's screen — same
 * auth as Reception. Read endpoints are gated to `read wallet`; mutating
 * check-ins (which post a wallet debit) to `create payment`, exactly like the
 * record-visit flow.
 *
 *  GET  /reception/attendance/slots?date=YYYY-MM-DD     — today's session slots (AC1)
 *  GET  /reception/attendance/slots/:slotId/bookings    — child cards for a slot (AC2)
 *  POST /reception/attendance/checkin                   — check one child in (AC3)
 *  POST /reception/attendance/checkin/bulk              — bulk check-in (AC4)
 */
export function registerAttendance(app: FastifyInstance, deps: ReceptionDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const readGuard = requirePermission("read", "wallet");
  const writeGuard = requirePermission("create", "payment");
  const clock = deps.now ?? (() => new Date());

  async function authStaff(
    req: FastifyRequest,
    reply: FastifyReply,
    guard: ReturnType<typeof requirePermission>,
  ): Promise<{ userId: string } | null> {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    // Staff-only: parents hold both `read wallet` and `create payment` and share
    // the session store, so the permission guard alone would let a parent check in
    // (and debit the wallet of) any family's booking and enumerate other children.
    if (!isStaffRole(auth.user.role)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    const perm = guard(auth.user);
    if (!perm.ok) {
      reply.code(perm.status).send({ error: perm.error });
      return null;
    }
    return { userId: auth.user.id };
  }

  // AC1: today's session slots (with booking + checked-in counts). Only slots
  // that actually have confirmed bookings are surfaced — empty slots are noise.
  app.get("/reception/attendance/slots", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await authStaff(req, reply, readGuard))) return reply;
    const q = req.query as { date?: string };
    const date = q.date && /^\d{4}-\d{2}-\d{2}$/u.test(q.date) ? q.date : clock().toISOString().slice(0, 10);

    const slots = await db
      .select({
        slotId: sessionSlots.id,
        serviceId: sessionSlots.serviceId,
        serviceName: services.name,
        slotDate: sessionSlots.slotDate,
        startTime: sessionSlots.startTime,
        endTime: sessionSlots.endTime,
        capacity: sessionSlots.capacity,
      })
      .from(sessionSlots)
      .innerJoin(services, eq(sessionSlots.serviceId, services.id))
      .where(eq(sessionSlots.slotDate, date))
      .orderBy(asc(sessionSlots.startTime));
    if (slots.length === 0) return reply.code(200).send({ date, slots: [] });

    const slotIds = slots.map((s) => s.slotId);
    const confirmed = await db
      .select({ id: bookings.id, slotId: bookings.slotId })
      .from(bookings)
      .where(and(inArray(bookings.slotId, slotIds), ne(bookings.status, "cancelled")));
    const bookingIds = confirmed.map((b) => b.id);
    const checkedIn = bookingIds.length
      ? await db
          .select({ bookingId: attendances.bookingId })
          .from(attendances)
          .where(inArray(attendances.bookingId, bookingIds))
      : [];
    const checkedInSet = new Set(checkedIn.map((a) => a.bookingId));

    const bookedBySlot = new Map<string, string[]>();
    for (const b of confirmed) {
      if (!b.slotId) continue;
      const list = bookedBySlot.get(b.slotId) ?? [];
      list.push(b.id);
      bookedBySlot.set(b.slotId, list);
    }

    const out: AttendanceSlot[] = slots
      .map((s) => {
        const ids = bookedBySlot.get(s.slotId) ?? [];
        return {
          slotId: s.slotId,
          serviceId: s.serviceId,
          serviceName: s.serviceName,
          slotDate: s.slotDate,
          startTime: s.startTime,
          endTime: s.endTime,
          capacity: s.capacity,
          bookedCount: ids.length,
          checkedInCount: ids.filter((id) => checkedInSet.has(id)).length,
        };
      })
      .filter((s) => s.bookedCount > 0);
    return reply.code(200).send({ date, slots: out });
  });

  // AC2: the booking list (child cards) for one slot.
  app.get(
    "/reception/attendance/slots/:slotId/bookings",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!(await authStaff(req, reply, readGuard))) return reply;
      const { slotId } = req.params as { slotId: string };
      // Guard the path param: a malformed slotId would otherwise hit the uuid
      // column and surface as a 500 rather than a clean 400.
      if (!UUID_RE.test(slotId)) {
        return reply.code(400).send({ error: "Invalid slot id" });
      }

      const rows = await db
        .select({
          bookingId: bookings.id,
          childId: children.id,
          childFirstName: children.firstName,
          childLastName: children.lastName,
          photoConsent: children.photoConsent,
          paidVia: bookings.paidVia,
          checkedInAt: attendances.checkedInAt,
          droppedOffAt: attendances.droppedOffAt,
          checkedOutAt: attendances.checkedOutAt,
        })
        .from(bookings)
        .innerJoin(children, eq(bookings.childId, children.id))
        .leftJoin(attendances, eq(attendances.bookingId, bookings.id))
        .where(and(eq(bookings.slotId, slotId), ne(bookings.status, "cancelled")))
        .orderBy(asc(children.firstName));

      const cards: AttendanceBookingCard[] = rows.map((r) => ({
        bookingId: r.bookingId,
        childId: r.childId,
        childName: `${r.childFirstName}${r.childLastName ? ` ${r.childLastName}` : ""}`,
        photoConsent: r.photoConsent,
        paidVia: r.paidVia === "subscription" ? "subscription" : "wallet",
        checkedInAt: r.checkedInAt ? r.checkedInAt.toISOString() : null,
        droppedOffAt: r.droppedOffAt ? r.droppedOffAt.toISOString() : null,
        checkedOutAt: r.checkedOutAt ? r.checkedOutAt.toISOString() : null,
      }));
      return reply.code(200).send({ slotId, bookings: cards });
    },
  );

  // AC3: check one child in (records checked_in_at + triggers the wallet debit).
  app.post("/reception/attendance/checkin", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await authStaff(req, reply, writeGuard);
    if (!ctx) return reply;
    const parsed = attendanceCheckInSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    try {
      const result = await checkInBooking(db, {
        bookingId: parsed.data.bookingId,
        droppedOffAt: parsed.data.droppedOffAt ?? null,
        actor: ctx.userId,
        ip: req.ip,
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof BookingNotFoundError) return reply.code(404).send({ error: err.message });
      if (err instanceof BookingCancelledError) return reply.code(409).send({ error: err.message });
      if (err instanceof AlreadyCheckedInError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // AC4: bulk check-in — best-effort per booking; one failure never aborts the rest.
  app.post(
    "/reception/attendance/checkin/bulk",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const ctx = await authStaff(req, reply, writeGuard);
      if (!ctx) return reply;
      const parsed = attendanceBulkCheckInSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
      }
      const results: AttendanceBulkResultItem[] = [];
      for (const bookingId of parsed.data.bookingIds) {
        try {
          const r = await checkInBooking(db, { bookingId, actor: ctx.userId, ip: req.ip });
          results.push({ bookingId, ok: true, outcome: r.outcome, error: null });
        } catch (err) {
          results.push({
            bookingId,
            ok: false,
            outcome: null,
            error: err instanceof Error ? err.message : "Check-in failed",
          });
        }
      }
      return reply.code(200).send({ results });
    },
  );
}
