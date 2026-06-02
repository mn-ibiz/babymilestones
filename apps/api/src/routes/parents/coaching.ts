import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { children, parents, staff, users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import {
  COACHING_AVAILABILITY_WINDOW_DAYS,
  coachingBookingCreateSchema,
  type CoachingAvailability,
  type CoachingBookingConfirmation,
  type CoachingSlotOption,
  type CoachOption,
} from "@bm/contracts";
import {
  bookCoachingSlot,
  CoachingCoachMismatchError,
  CoachingServicePriceMissingError,
  CoachingSlotFullError,
  CoachingSlotNotFoundError,
  CoachingSlotTakenError,
  getService,
  listAvailableCoachingSlotsWithSeats,
} from "@bm/catalog";
import { StubSmsSender, type SmsSender } from "@bm/sms";
import type { ParentsDeps } from "./index.js";

export interface CoachingRoutesDeps extends ParentsDeps {
  /** SMS sender for the confirmation. Defaults to the DB-backed stub. */
  sms?: SmsSender;
  /** Clock for deterministic "today" in tests. Defaults to real time. */
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

function addDaysIso(dateIso: string, days: number): string {
  return new Date(Date.parse(`${dateIso}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Coaching parent booking (P5-E01-S02 / Story 31.2 + P5-E01-S03 / Story 31.3). The
 * parent flow: pick a coaching offering → a coach → a date → the available slots
 * (AC2). A specific coach filters to only their open slots (AC2). Confirming books
 * the chosen slot, attributing the coach and raising a pending invoice, reusing the
 * P2-E01 invoice + attribution + audit write path (AC4).
 *
 * Capacity-aware (P5-E01-S03): a 1:1 offering holds ONE private seat per slot; a
 * GROUP offering holds N seats, and the availability reports `seatsRemaining`
 * ("X seats left"). A parent books an INDIVIDUAL seat — each seat raises its own
 * pending invoice; the (N+1)th attempt is rejected (the session is full).
 */
export function registerParentCoaching(app: FastifyInstance, deps: CoachingRoutesDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const sender: SmsSender = deps.sms ?? new StubSmsSender(db);
  const clock = deps.now ?? (() => new Date());

  /** Authenticate + resolve the parent profile. Returns the parentId + acting userId. */
  async function requireParent(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ parentId: string; userId: string } | null> {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    const [profile] = await db.select().from(parents).where(eq(parents.userId, auth.user.id));
    if (!profile) {
      reply.code(404).send({ error: "Parent profile not found" });
      return null;
    }
    return { parentId: profile.id, userId: auth.user.id };
  }

  // Available coaching slots for an offering over the browse window, optionally
  // filtered by a chosen coach (AC2). Returns the coach picker (the coaches with
  // an open slot) alongside the slot list.
  app.get(
    "/parents/me/coaching/services/:serviceId/availability",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parent = await requireParent(req, reply);
      if (!parent) return reply;

      const { serviceId } = req.params as { serviceId: string };
      const { staffId } = (req.query ?? {}) as { staffId?: string };

      const service = await getService(db, serviceId);
      if (!service || !service.isActive || service.unit !== "coaching") {
        return reply.code(404).send({ error: "Service not found" });
      }

      const today = clock().toISOString().slice(0, 10);
      const toDate = addDaysIso(today, COACHING_AVAILABILITY_WINDOW_DAYS);

      // The full open-slot set drives the coach picker (every coach with an open
      // seat), so the picker is stable regardless of the active filter. Slots that
      // are full (0 seats remaining) are already excluded (P5-E01-S03 AC2).
      const allOpen = await listAvailableCoachingSlotsWithSeats(db, { serviceId, fromDate: today, toDate });
      const byCoach = new Map<string, string>();
      for (const s of allOpen) {
        if (!byCoach.has(s.staffId)) byCoach.set(s.staffId, "");
      }
      // Snapshot display names for the coaches that appear.
      const staffRows = await db.select().from(staff);
      const nameOf = new Map(staffRows.map((r) => [r.id, r.displayName] as const));
      const coaches: CoachOption[] = [...byCoach.keys()]
        .map((id) => ({ id, displayName: nameOf.get(id) ?? "" }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      const filtered =
        staffId !== undefined
          ? await listAvailableCoachingSlotsWithSeats(db, { serviceId, staffId, fromDate: today, toDate })
          : allOpen;
      const slots: CoachingSlotOption[] = filtered.map((s) => ({
        id: s.id,
        staffId: s.staffId,
        staffName: nameOf.get(s.staffId) ?? "",
        slotDate: s.slotDate,
        startTime: s.startTime,
        endTime: s.endTime,
        durationMinutes: s.durationMinutes,
        // Seats for the group flow (1 for a 1:1 offering) (P5-E01-S03 AC2).
        capacity: s.capacity,
        seatsRemaining: s.seatsRemaining,
      }));

      const body: CoachingAvailability = {
        serviceId,
        windowStart: today,
        coaches,
        staffId: staffId ?? null,
        slots,
      };
      return reply.code(200).send(body);
    },
  );

  // Confirm a 1:1 coaching booking (AC3/AC4). The parent picked a specific coach;
  // the server books the chosen slot, attributing the slot's coach (the pick must
  // match, AC2) and raising a pending invoice from the offering's effective price.
  app.post("/parents/me/coaching/bookings", async (req: FastifyRequest, reply: FastifyReply) => {
    const parent = await requireParent(req, reply);
    if (!parent) return reply;

    const parsed = coachingBookingCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { coachingSlotId, childId, staffId } = parsed.data;

    // Child must belong to this parent and not be archived.
    const [child] = await db.select().from(children).where(eq(children.id, childId));
    if (!child || child.parentId !== parent.parentId || child.archivedAt !== null) {
      return reply.code(404).send({ error: "Child not found" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, parent.userId));

    let result;
    try {
      result = await bookCoachingSlot(db, {
        coachingSlotId,
        parentId: parent.parentId,
        childId,
        staffId: staffId ?? null,
        actor: parent.userId,
        ip: req.ip,
      });
    } catch (err) {
      if (err instanceof CoachingSlotTakenError) {
        return reply.code(409).send({ error: "That slot was just taken — please pick another" });
      }
      if (err instanceof CoachingSlotFullError) {
        return reply.code(409).send({ error: "This group session is full — please pick another" });
      }
      if (err instanceof CoachingCoachMismatchError) {
        return reply.code(409).send({ error: "That coach is no longer available for this slot" });
      }
      if (err instanceof CoachingServicePriceMissingError) {
        return reply.code(409).send({ error: "This service has no price set yet" });
      }
      if (err instanceof CoachingSlotNotFoundError) {
        return reply.code(404).send({ error: "Slot not found" });
      }
      throw err;
    }

    const service = await getService(db, result.serviceId);
    if (user?.phone) {
      try {
        // P5-E01-S05 (Story 31.5 AC2): a discreet (sensitive) coaching service
        // confirms under its NEUTRAL label so the SMS carries no sensitive
        // service detail. Non-discreet services keep their real name unchanged.
        const discreetLabel = (service?.discreetBillingLabel ?? "").trim();
        const serviceName =
          service?.discreetBillingEnabled && discreetLabel !== ""
            ? discreetLabel
            : (service?.name ?? "Coaching session");
        await sender.send({
          to: user.phone,
          template: "booking.confirmed",
          data: {
            childName: child.firstName,
            serviceName,
            date: result.slotDate,
            time: result.startTime,
          },
        });
      } catch {
        req.log.warn(
          { event: "coaching_booking.sms_failed", bookingId: result.bookingId },
          "coaching booking SMS failed",
        );
      }
    }

    const body: CoachingBookingConfirmation = {
      bookingId: result.bookingId,
      invoiceId: result.invoiceId,
      coachingSlotId: result.coachingSlotId,
      serviceId: result.serviceId,
      staffId: result.staffId,
      slotDate: result.slotDate,
      startTime: result.startTime,
      endTime: result.endTime,
      amountCents: result.amountCents,
    };
    return reply.code(201).send(body);
  });
}
