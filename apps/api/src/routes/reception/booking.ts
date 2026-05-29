import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { children, parents, users, type Database } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import {
  ageInMonths,
  receptionBookingCreateSchema,
  slotFitsAge,
  AVAILABILITY_WINDOW_DAYS,
  type BookableService,
  type BookingConfirmation,
  type ServiceAvailability,
  type ServiceUnit,
} from "@bm/contracts";
import {
  bookSlot,
  browseServiceSlots,
  checkBookingAttribution,
  DuplicateBookingError,
  getService,
  getSlotWithRemaining,
  getStaff,
  isSlotPast,
  listServices,
  ServicePriceMissingError,
  SlotFullError,
  SlotNotFoundError,
} from "@bm/catalog";
import { StubSmsSender, type SmsSender } from "@bm/sms";
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

/**
 * Reception books a slot for a walk-in (P2-E01-S04). `POST /reception/bookings
 * { parentId, childId, slotId, staffId? }`. Same atomic engine as the parent
 * self-book (`bookSlot` — slot lock, capacity, snapshotted pending invoice, AC2),
 * plus staff attribution when the service requires it (AC3). Staff-only via rbac
 * `create payment` (Reception + Cashier); the acting user is the session staff.
 */
export function registerReceptionBooking(app: FastifyInstance, deps: ReceptionDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const sender: SmsSender = deps.sms ?? new StubSmsSender(db);
  const guard = requirePermission("create", "payment");

  /**
   * Gate the booking-flow read endpoints to booking-capable staff (`create
   * payment` — reception / cashier). Crucially this rejects a `parent` session
   * (parents and staff share one session store + principal), so a parent can NOT
   * enumerate another parent's children / availability via these routes.
   */
  async function requireBookingStaff(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const authResult = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!authResult.ok) {
      reply.code(authResult.status).send({ error: authResult.error });
      return false;
    }
    const perm = guard(authResult.user);
    if (!perm.ok) {
      reply.code(perm.status).send({ error: perm.error });
      return false;
    }
    return true;
  }

  // Active services Reception can book (the "New booking → service picker", AC1).
  app.get("/reception/bookable-services", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireBookingStaff(req, reply))) return reply;
    const rows = await listServices(db, { activeOnly: true });
    const services: BookableService[] = rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      unit: s.unit as ServiceUnit,
      ageMinMonths: s.ageMinMonths,
      ageMaxMonths: s.ageMaxMonths,
    }));
    return reply.code(200).send({ services });
  });

  // A parent's bookable children (the "child picker", AC1).
  app.get(
    "/reception/parents/:parentId/children",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireBookingStaff(req, reply))) return reply;
      const { parentId } = req.params as { parentId: string };
      const rows = await db.select().from(children).where(eq(children.parentId, parentId));
      const kids = rows
        .filter((c) => c.archivedAt === null)
        .map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          ageInMonths: ageInMonths(c.dateOfBirth),
        }));
      return reply.code(200).send({ children: kids });
    },
  );

  // Available slots for a parent's child on a service (the "slot picker", AC1).
  app.get(
    "/reception/parents/:parentId/services/:serviceId/availability",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireBookingStaff(req, reply))) return reply;
      const { parentId, serviceId } = req.params as { parentId: string; serviceId: string };
      const { childId } = (req.query ?? {}) as { childId?: string };
      if (!childId) return reply.code(400).send({ error: "childId is required", field: "childId" });
      const [child] = await db.select().from(children).where(eq(children.id, childId));
      if (!child || child.parentId !== parentId || child.archivedAt !== null) {
        return reply.code(404).send({ error: "Child not found" });
      }
      const service = await getService(db, serviceId);
      if (!service || !service.isActive) return reply.code(404).send({ error: "Service not found" });

      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      const ageMonths = ageInMonths(child.dateOfBirth, now);
      const eligible = slotFitsAge(ageMonths, service.ageMinMonths, service.ageMaxMonths);
      const slots = eligible
        ? await browseServiceSlots(db, { serviceId, fromDate: today, days: AVAILABILITY_WINDOW_DAYS, today, nowMinutes })
        : [];
      const body: ServiceAvailability = {
        serviceId,
        childId,
        windowStart: today,
        ageMonths,
        ageMinMonths: service.ageMinMonths,
        ageMaxMonths: service.ageMaxMonths,
        eligible,
        slots: slots.map((s) => ({
          id: s.id,
          slotDate: s.slotDate,
          startTime: s.startTime,
          endTime: s.endTime,
          capacity: s.capacity,
          remainingCapacity: s.remainingCapacity,
          isPast: s.isPast,
          available: s.available,
        })),
      };
      return reply.code(200).send(body);
    },
  );

  app.post("/reception/bookings", async (req: FastifyRequest, reply: FastifyReply) => {
    const authResult = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!authResult.ok) return reply.code(authResult.status).send({ error: authResult.error });
    const perm = guard(authResult.user);
    if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });

    const parsed = receptionBookingCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { parentId, childId, slotId, staffId } = parsed.data;

    const [parent] = await db.select().from(parents).where(eq(parents.id, parentId));
    if (!parent) return reply.code(404).send({ error: "Parent not found" });

    const [child] = await db.select().from(children).where(eq(children.id, childId));
    if (!child || child.parentId !== parentId || child.archivedAt !== null) {
      return reply.code(422).send({ error: "Child does not belong to this parent" });
    }

    const slot = await getSlotWithRemaining(db, slotId);
    if (!slot) return reply.code(404).send({ error: "Slot not found" });

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (isSlotPast(slot.slotDate, slot.endTime, today, nowMinutes)) {
      return reply.code(409).send({ error: "This slot has already passed" });
    }

    const service = await getService(db, slot.serviceId);
    if (!service || !service.isActive) return reply.code(404).send({ error: "Service not found" });

    if (!slotFitsAge(ageInMonths(child.dateOfBirth, now), service.ageMinMonths, service.ageMaxMonths)) {
      return reply.code(422).send({ error: "Child is not eligible for this service" });
    }

    // Attribution (AC3): when the service requires a role, a matching active staff
    // member must be supplied; the booking snapshots that member's name.
    let staffNameSnapshot = "";
    const requiredRole = service.attributionRoleRequired;
    const staffRow = staffId ? await getStaff(db, staffId) : null;
    if (staffId && !staffRow) return reply.code(404).send({ error: "Staff member not found" });
    // Never attribute a booking to a retired staff member, even for a service
    // that doesn't require attribution (keeps commission/attribution data clean).
    if (staffRow && !staffRow.active) {
      return reply.code(422).send({ error: "Attribution required: staff_inactive" });
    }
    const check = checkBookingAttribution(
      requiredRole,
      staffRow ? { role: staffRow.role, isActive: staffRow.active } : null,
    );
    if (!check.ok) return reply.code(422).send({ error: `Attribution required: ${check.reason}` });
    if (staffRow) staffNameSnapshot = staffRow.displayName;

    let result;
    try {
      result = await bookSlot(db, {
        slotId,
        parentId,
        childId,
        staffId: staffRow ? staffRow.id : null,
        staffNameSnapshot,
        actor: authResult.user.id,
        ip: req.ip,
      });
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

    const [user] = await db.select().from(users).where(eq(users.id, parent.userId));
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
