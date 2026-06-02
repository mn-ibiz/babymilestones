import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { children, parents, users, wallets, type Database } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME, normalizePhone } from "@bm/auth";
import {
  bookSalonSlot,
  createAdHocSalonSlot,
  completeSalonService,
  getService,
  listSalonBookingsForDate,
  noopSalonFeedbackHook,
  reassignSalonBooking,
  SalonAlreadyCompletedError,
  SalonBookingNotFoundError,
  SalonNotCheckedInError,
  SalonServicePriceMissingError,
  SalonSlotTakenError,
  SalonStylistMismatchError,
  SalonStylistUnavailableError,
  getStaff,
  type SalonFeedbackHook,
} from "@bm/catalog";
import { reassignBookingCommission } from "@bm/wallet";
import {
  groupSalonBookingsByStylistAndHour,
  salonCheckInSchema,
  salonCompleteSchema,
  salonReassignSchema,
  salonWalkInSchema,
  type SalonCompleteResult,
  type SalonCounterBoard,
  type SalonCounterBooking,
  type SalonReassignResult,
  type SalonWalkInResult,
} from "@bm/contracts";
import {
  AlreadyCheckedInError,
  BookingCancelledError,
  BookingNotFoundError,
  checkInBooking,
} from "./attendance.js";
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

/** Postgres unique-constraint violation (SQLSTATE 23505). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === "23505" || /duplicate key|unique constraint/iu.test(e?.message ?? "");
}

/** `HH:MM` for the wall-clock hour of `d` (UTC, matching the rest of the slot math). */
function hourStartOf(d: Date): { startTime: string; endTime: string } {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const next = String((d.getUTCHours() + 1) % 24).padStart(2, "0");
  return { startTime: `${h}:00`, endTime: `${next === "00" ? "23:59" : `${next}:00`}` };
}

export interface ReceptionSalonDeps extends ReceptionDeps {
  /**
   * Forward-compatible salon feedback-prompt hook (Story 25.3 AC3 → P5-E04 / Epic
   * 34, NOT yet built). Defaults to a no-op; the future feedback engine wires a
   * real implementation here. A hook error never fails a completed service.
   */
  salonFeedbackHook?: SalonFeedbackHook;
}

/**
 * Salon counter check-in & service completion (P3-E03-S03 / Story 25.3), operated
 * via Reception's screen (same auth as the attendant check-in).
 *
 *  GET  /reception/salon/board?date=YYYY-MM-DD  — today's salon bookings by stylist/hour (AC1)
 *  POST /reception/salon/checkin                — check a child in (wallet debit + commission, AC2)
 *  POST /reception/salon/complete               — mark complete (consent-gated photo + feedback hook, AC3)
 *  POST /reception/salon/walk-in                — create parent + child + book now + check in (AC4)
 *
 * Reads gated to `read wallet`; the check-in / complete mutations (which post a
 * wallet debit) to `create payment`; the walk-in (which creates a user) to
 * `create user` — exactly matching the existing reception surfaces it composes.
 */
export function registerReceptionSalon(app: FastifyInstance, deps: ReceptionSalonDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const readGuard = requirePermission("read", "wallet");
  const payGuard = requirePermission("create", "payment");
  const userGuard = requirePermission("create", "user");
  const clock = deps.now ?? (() => new Date());
  const feedbackHook = deps.salonFeedbackHook ?? noopSalonFeedbackHook;

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
    const perm = guard(auth.user);
    if (!perm.ok) {
      reply.code(perm.status).send({ error: perm.error });
      return null;
    }
    return { userId: auth.user.id };
  }

  // AC1: today's salon bookings grouped by stylist, by hour.
  app.get("/reception/salon/board", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await authStaff(req, reply, readGuard))) return reply;
    const q = req.query as { date?: string };
    const date =
      q.date && /^\d{4}-\d{2}-\d{2}$/u.test(q.date) ? q.date : clock().toISOString().slice(0, 10);
    const rows = await listSalonBookingsForDate(db, { date });
    const board: SalonCounterBoard = groupSalonBookingsByStylistAndHour(
      rows as unknown as SalonCounterBooking[],
      date,
    );
    return reply.code(200).send(board);
  });

  // AC2: tap a booking → check in → wallet debit (reuse P1-E03-S05) + commission
  // line (reuse P3-E01-S02). Reuses the attendant `checkInBooking` orchestration —
  // a salon booking carries its own invoice + wallet + staff attribution, so the
  // debit + commission + attendance path is identical to a session-slot check-in.
  app.post("/reception/salon/checkin", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await authStaff(req, reply, payGuard);
    if (!ctx) return reply;
    const parsed = salonCheckInSchema.safeParse(req.body ?? {});
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

  // AC3: mark complete → optional photo (consent-gated) + feedback prompt (forward-
  // compatible hook to P5-E04).
  app.post("/reception/salon/complete", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await authStaff(req, reply, payGuard);
    if (!ctx) return reply;
    const parsed = salonCompleteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    try {
      const result = await completeSalonService(
        db,
        {
          bookingId: parsed.data.bookingId,
          actor: ctx.userId,
          photoRef: parsed.data.photoRef ?? null,
          ip: req.ip,
        },
        feedbackHook,
      );
      const out: SalonCompleteResult = result;
      return reply.code(201).send(out);
    } catch (err) {
      if (err instanceof SalonBookingNotFoundError) return reply.code(404).send({ error: err.message });
      if (err instanceof SalonNotCheckedInError) return reply.code(409).send({ error: err.message });
      if (err instanceof SalonAlreadyCompletedError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // Story 25.4: select-and-reassign — move a booking to a different stylist on the
  // day. Picks an open slot for the target (lock-then-check, reusing 25-2's
  // double-book guard), updates attribution + audits (catalog). If the booking was
  // already settled, moves commission proportionally old→new via the ledger
  // helper (AC4) — reverse old, post new at the new stylist's rate.
  app.post("/reception/salon/reassign", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await authStaff(req, reply, payGuard);
    if (!ctx) return reply;
    const parsed = salonReassignSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    try {
      const moved = await reassignSalonBooking(db, {
        bookingId: parsed.data.bookingId,
        toStaffId: parsed.data.toStaffId,
        actor: ctx.userId,
        ip: req.ip,
      });
      // AC4: a settled booking's commission moves to the new stylist (reverse old,
      // post new). A no-op move (same stylist) or an unsettled booking skips this.
      if (!moved.unchanged && moved.commissionMoved) {
        await reassignBookingCommission(db, {
          bookingId: moved.bookingId,
          fromStaffId: moved.fromStaffId,
          postedBy: ctx.userId,
        });
      }
      const out: SalonReassignResult = {
        bookingId: moved.bookingId,
        fromStaffId: moved.fromStaffId,
        toStaffId: moved.toStaffId,
        newSalonSlotId: moved.newSalonSlotId,
        unchanged: moved.unchanged,
        commissionMoved: moved.commissionMoved,
      };
      return reply.code(201).send(out);
    } catch (err) {
      if (err instanceof SalonBookingNotFoundError) return reply.code(404).send({ error: err.message });
      if (err instanceof SalonStylistUnavailableError) {
        return reply.code(409).send({ error: "That stylist has no open slot for this booking" });
      }
      throw err;
    }
  });

  // AC4: walk-in — create parent (reuse P1-E02-S02 shape) → add child → book a
  // one-off salon slot for now with the chosen stylist → check in. Composes the
  // existing walk-in + 25-2 booking + check-in paths.
  app.post("/reception/salon/walk-in", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await authStaff(req, reply, userGuard);
    if (!ctx) return reply;
    const parsed = salonWalkInSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const input = parsed.data;

    const phone = normalizePhone(input.phone);
    if (!phone) {
      return reply.code(400).send({ error: "Enter a valid Kenyan phone number", field: "phone" });
    }

    // Validate the salon service + stylist BEFORE creating any parent rows.
    const service = await getService(db, input.serviceId);
    if (!service || !service.isActive || service.unit !== "salon") {
      return reply.code(404).send({ error: "Salon service not found" });
    }
    const stylist = await getStaff(db, input.staffId);
    if (!stylist) return reply.code(404).send({ error: "Stylist not found" });
    if (!stylist.active) return reply.code(422).send({ error: "Stylist is inactive" });

    // A duplicate phone is a conflict (mirrors the walk-in route).
    const [existingUser] = await db.select().from(users).where(eq(users.phone, phone));
    if (existingUser) {
      return reply.code(409).send({ error: "A parent with this phone already exists" });
    }

    // 1) Create parent (+ wallet + child) — reuse the walk-in registration shape.
    let created: { userId: string; parentId: string; childId: string };
    try {
      created = await db.transaction(async (tx) => {
        const [user] = await tx.insert(users).values({ phone }).returning();
        await tx.insert(wallets).values({ userId: user!.id });
        const [parent] = await tx
          .insert(parents)
          .values({
            userId: user!.id,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            residentialArea: input.residentialArea,
          })
          .returning();
        const [child] = await tx
          .insert(children)
          .values({
            parentId: parent!.id,
            firstName: input.childFirstName,
            lastName: input.childLastName ?? null,
            dateOfBirth: input.childDateOfBirth,
            photoConsent: input.photoConsent ?? false,
          })
          .returning();
        return { userId: user!.id, parentId: parent!.id, childId: child!.id };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: "A parent with this phone already exists" });
      }
      throw err;
    }

    // 2) Book a one-off salon slot for now (AC4) and confirm it (reuses 25-2's
    //    bookSalonSlot — pending invoice + attribution + audit).
    const now = clock();
    const { startTime, endTime } = hourStartOf(now);
    const slotDate = now.toISOString().slice(0, 10);
    const slot = await createAdHocSalonSlot(db, {
      staffId: stylist.id,
      serviceId: service.id,
      slotDate,
      startTime: input.startTime ?? startTime,
      endTime,
      durationMinutes: service.salonDurationMinutes ?? undefined,
    });

    let booked;
    try {
      booked = await bookSalonSlot(db, {
        salonSlotId: slot.id,
        parentId: created.parentId,
        childId: created.childId,
        staffId: stylist.id,
        actor: ctx.userId,
        ip: req.ip,
      });
    } catch (err) {
      if (err instanceof SalonServicePriceMissingError) {
        return reply.code(409).send({ error: "This service has no price set yet" });
      }
      if (err instanceof SalonSlotTakenError || err instanceof SalonStylistMismatchError) {
        return reply.code(409).send({ error: "Could not book the walk-in slot" });
      }
      throw err;
    }

    // 3) Check the child in immediately (AC4) — wallet debit + commission via the
    //    shared orchestration.
    const checkin = await checkInBooking(db, {
      bookingId: booked.bookingId,
      actor: ctx.userId,
      ip: req.ip,
    });

    const out: SalonWalkInResult = {
      userId: created.userId,
      parentId: created.parentId,
      childId: created.childId,
      bookingId: booked.bookingId,
      invoiceId: booked.invoiceId,
      salonSlotId: slot.id,
      attendanceId: checkin.attendanceId,
      outcome: checkin.outcome,
    };
    return reply.code(201).send(out);
  });
}
