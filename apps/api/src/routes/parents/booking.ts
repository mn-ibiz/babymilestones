import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { children, parents, users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import { ageInMonths, bookingCreateSchema, slotFitsAge, type BookingConfirmation } from "@bm/contracts";
import {
  bookSlot,
  DuplicateBookingError,
  getService,
  getSlotWithRemaining,
  isSlotPast,
  ServicePriceMissingError,
  SlotFullError,
  SlotNotFoundError,
} from "@bm/catalog";
import { StubSmsSender, type SmsSender } from "@bm/sms";
import type { ParentsDeps } from "./index.js";

export interface BookingRoutesDeps extends ParentsDeps {
  /** SMS sender for the confirmation (AC5). Defaults to the DB-backed stub. */
  sms?: SmsSender;
  /** Clock for deterministic past-slot checks in tests. Defaults to real time. */
  now?: () => Date;
}

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
 * Parent slot-booking (P2-E01-S03). `POST /parents/me/bookings { slotId, childId }`
 * books a slot for one of the parent's eligible children: it locks the slot,
 * rejects a full one with 409 "Slot just filled" (AC4), creates a pending invoice
 * at the snapshotted service price (AC3), records the booking (AC2), and sends an
 * SMS-stub confirmation with the date/time + child name (AC5). The mutation
 * requires the CSRF token; ownership + eligibility are derived server-side.
 */
export function registerParentBooking(app: FastifyInstance, deps: BookingRoutesDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const sender: SmsSender = deps.sms ?? new StubSmsSender(db);
  const clock = deps.now ?? (() => new Date());

  app.post("/parents/me/bookings", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
    const [profile] = await db.select().from(parents).where(eq(parents.userId, auth.user.id));
    if (!profile) return reply.code(404).send({ error: "Parent profile not found" });
    const [user] = await db.select().from(users).where(eq(users.id, auth.user.id));

    const parsed = bookingCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { slotId, childId } = parsed.data;

    // Child must belong to this parent and not be archived.
    const [child] = await db.select().from(children).where(eq(children.id, childId));
    if (!child || child.parentId !== profile.id || child.archivedAt !== null) {
      return reply.code(404).send({ error: "Child not found" });
    }

    const slot = await getSlotWithRemaining(db, slotId);
    if (!slot) return reply.code(404).send({ error: "Slot not found" });

    const now = clock();
    const today = now.toISOString().slice(0, 10);
    const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (isSlotPast(slot.slotDate, slot.endTime, today, nowMinutes)) {
      return reply.code(409).send({ error: "This slot has already passed" });
    }

    const service = await getService(db, slot.serviceId);
    if (!service || !service.isActive) return reply.code(404).send({ error: "Service not found" });

    // AC1 — only an eligible child may book.
    const ageMonths = ageInMonths(child.dateOfBirth, now);
    if (!slotFitsAge(ageMonths, service.ageMinMonths, service.ageMaxMonths)) {
      return reply.code(422).send({ error: "Child is not eligible for this service" });
    }

    let result;
    try {
      // The booking + its pending invoice + the audit row all commit atomically
      // inside bookSlot (so a committed booking is always audited).
      result = await bookSlot(db, { slotId, parentId: profile.id, childId, actor: auth.user.id, ip: req.ip });
    } catch (err) {
      if (err instanceof SlotFullError) {
        return reply.code(409).send({ error: "Slot just filled — please pick another time" });
      }
      if (err instanceof DuplicateBookingError) {
        return reply.code(409).send({ error: "This child is already booked in that slot" });
      }
      if (err instanceof ServicePriceMissingError) {
        return reply.code(409).send({ error: "This service has no price set yet" });
      }
      if (err instanceof SlotNotFoundError) {
        return reply.code(404).send({ error: "Slot not found" });
      }
      throw err;
    }

    // AC5 — SMS-stub confirmation. Transactional notification: sent regardless of
    // marketing consent. Never fail a committed booking on a notification error.
    if (user?.phone) {
      try {
        await sender.send({
          to: user.phone,
          template: "booking.confirmed",
          data: {
            childName: child.firstName,
            serviceName: service.name,
            date: result.slotDate,
            time: result.startTime,
          },
        });
      } catch {
        req.log.warn({ event: "booking.sms_failed", bookingId: result.bookingId }, "booking SMS failed");
      }
    }

    const body: BookingConfirmation = {
      bookingId: result.bookingId,
      invoiceId: result.invoiceId,
      slotId,
      serviceId: result.serviceId,
      slotDate: result.slotDate,
      startTime: result.startTime,
      endTime: result.endTime,
      amountCents: result.amountCents,
    };
    return reply.code(201).send(body);
  });
}
