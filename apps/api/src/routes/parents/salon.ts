import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { children, parents, staff, users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import {
  SALON_AVAILABILITY_WINDOW_DAYS,
  salonBookingCreateSchema,
  type SalonAvailability,
  type SalonBookingConfirmation,
  type SalonSlotOption,
  type SalonStylistOption,
} from "@bm/contracts";
import {
  bookSalonSlot,
  getService,
  listAvailableSalonSlots,
  NoStylistAvailableError,
  resolveLeastBusyStylist,
  SalonServicePriceMissingError,
  SalonSlotNotFoundError,
  SalonSlotTakenError,
  SalonStylistMismatchError,
} from "@bm/catalog";
import { StubSmsSender, type SmsSender } from "@bm/sms";
import type { ParentsDeps } from "./index.js";

export interface SalonRoutesDeps extends ParentsDeps {
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
 * Kids-Only Salon parent booking (P3-E03-S02 / Story 25.2). The parent flow:
 * pick a service → optionally a stylist (default "Any available") → a date →
 * the available salon slots (AC1). A specific stylist filters to only their open
 * slots (AC2). Confirming books the chosen slot, attributing the resolved stylist
 * — the least-busy one when "Any available" (AC3) — and raises a pending invoice,
 * reusing the P2-E01 invoice + attribution + audit write path (AC4).
 */
export function registerParentSalon(app: FastifyInstance, deps: SalonRoutesDeps): void {
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

  // Available salon slots for a service over the browse window, optionally filtered
  // by a chosen stylist (AC1/AC2). Returns the stylist picker (the stylists with
  // an open slot) alongside the slot list.
  app.get(
    "/parents/me/salon/services/:serviceId/availability",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parent = await requireParent(req, reply);
      if (!parent) return reply;

      const { serviceId } = req.params as { serviceId: string };
      const { staffId } = (req.query ?? {}) as { staffId?: string };

      const service = await getService(db, serviceId);
      if (!service || !service.isActive || service.unit !== "salon") {
        return reply.code(404).send({ error: "Service not found" });
      }

      const today = clock().toISOString().slice(0, 10);
      const toDate = addDaysIso(today, SALON_AVAILABILITY_WINDOW_DAYS);

      // The full open-slot set drives the stylist picker (every stylist with an
      // open slot), so the picker is stable regardless of the active filter.
      const allOpen = await listAvailableSalonSlots(db, { serviceId, fromDate: today, toDate });
      const byStylist = new Map<string, string>();
      for (const s of allOpen) {
        if (!byStylist.has(s.staffId)) byStylist.set(s.staffId, "");
      }
      // Snapshot display names for the stylists that appear.
      const staffRows = await db.select().from(staff);
      const nameOf = new Map(staffRows.map((r) => [r.id, r.displayName] as const));
      const stylists: SalonStylistOption[] = [...byStylist.keys()]
        .map((id) => ({ id, displayName: nameOf.get(id) ?? "" }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      const filtered =
        staffId !== undefined
          ? await listAvailableSalonSlots(db, { serviceId, staffId, fromDate: today, toDate })
          : allOpen;
      const slots: SalonSlotOption[] = filtered.map((s) => ({
        id: s.id,
        staffId: s.staffId,
        staffName: nameOf.get(s.staffId) ?? "",
        slotDate: s.slotDate,
        startTime: s.startTime,
        endTime: s.endTime,
        durationMinutes: s.durationMinutes,
      }));

      const body: SalonAvailability = {
        serviceId,
        windowStart: today,
        stylists,
        staffId: staffId ?? null,
        slots,
      };
      return reply.code(200).send(body);
    },
  );

  // Confirm a salon booking (AC3/AC4). When the parent didn't pick a stylist
  // ("Any available"), the server resolves the least-busy stylist on that slot's
  // date and books one of their open slots; otherwise it books the chosen slot.
  app.post("/parents/me/salon/bookings", async (req: FastifyRequest, reply: FastifyReply) => {
    const parent = await requireParent(req, reply);
    if (!parent) return reply;

    const parsed = salonBookingCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { salonSlotId, childId, staffId } = parsed.data;

    // Child must belong to this parent and not be archived.
    const [child] = await db.select().from(children).where(eq(children.id, childId));
    if (!child || child.parentId !== parent.parentId || child.archivedAt !== null) {
      return reply.code(404).send({ error: "Child not found" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, parent.userId));

    let result;
    try {
      result = await bookSalonSlot(db, {
        salonSlotId,
        parentId: parent.parentId,
        childId,
        // staffId omitted = "Any available" — bookSalonSlot attributes the slot's
        // own stylist (the client already resolved a least-busy stylist's slot).
        staffId: staffId ?? null,
        actor: parent.userId,
        ip: req.ip,
      });
    } catch (err) {
      if (err instanceof SalonSlotTakenError) {
        return reply.code(409).send({ error: "That slot was just taken — please pick another" });
      }
      if (err instanceof SalonStylistMismatchError) {
        return reply.code(409).send({ error: "That stylist is no longer available for this slot" });
      }
      if (err instanceof SalonServicePriceMissingError) {
        return reply.code(409).send({ error: "This service has no price set yet" });
      }
      if (err instanceof SalonSlotNotFoundError) {
        return reply.code(404).send({ error: "Slot not found" });
      }
      throw err;
    }

    const service = await getService(db, result.serviceId);
    if (user?.phone) {
      try {
        await sender.send({
          to: user.phone,
          template: "booking.confirmed",
          data: {
            childName: child.firstName,
            serviceName: service?.name ?? "Salon visit",
            date: result.slotDate,
            time: result.startTime,
          },
        });
      } catch {
        req.log.warn({ event: "salon_booking.sms_failed", bookingId: result.bookingId }, "salon booking SMS failed");
      }
    }

    const body: SalonBookingConfirmation = {
      bookingId: result.bookingId,
      invoiceId: result.invoiceId,
      salonSlotId: result.salonSlotId,
      serviceId: result.serviceId,
      staffId: result.staffId,
      slotDate: result.slotDate,
      startTime: result.startTime,
      endTime: result.endTime,
      amountCents: result.amountCents,
    };
    return reply.code(201).send(body);
  });

  // Resolve the least-busy stylist for an "Any available" pick on a date (AC3) —
  // the client calls this to learn which stylist's slot it should confirm.
  app.get(
    "/parents/me/salon/services/:serviceId/least-busy",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parent = await requireParent(req, reply);
      if (!parent) return reply;
      const { serviceId } = req.params as { serviceId: string };
      const { date } = (req.query ?? {}) as { date?: string };
      if (!date) return reply.code(400).send({ error: "date is required", field: "date" });
      const service = await getService(db, serviceId);
      if (!service || !service.isActive || service.unit !== "salon") {
        return reply.code(404).send({ error: "Service not found" });
      }
      try {
        const staffId = await resolveLeastBusyStylist(db, { serviceId, date });
        return reply.code(200).send({ staffId });
      } catch (err) {
        if (err instanceof NoStylistAvailableError) {
          return reply.code(404).send({ error: "No stylist available on that date" });
        }
        throw err;
      }
    },
  );
}
