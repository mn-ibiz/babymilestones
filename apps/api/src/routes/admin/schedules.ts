import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import type { SessionStore } from "@bm/auth";
import { scheduleCreateSchema, scheduleUpdateSchema } from "@bm/contracts";
import {
  createSchedule,
  generateSlotsForSchedule,
  getSchedule,
  getService,
  hmToMinutes,
  listSchedules,
  listSlotsWithRemaining,
  resyncScheduleSlots,
  updateSchedule,
  type SlotWithRemaining,
} from "@bm/catalog";

/** A `YYYY-MM-DD` calendar date (the slot window query params). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

export interface AdminSchedulesDeps {
  db: Database;
  sessions: SessionStore;
  /** Clock injection for deterministic tests; defaults to real time. */
  now?: () => Date;
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

/** Public shape of a schedule row. */
function serializeSchedule(row: NonNullable<Awaited<ReturnType<typeof getSchedule>>>) {
  return {
    id: row.id,
    serviceId: row.serviceId,
    dayOfWeek: row.dayOfWeek,
    startTime: row.startTime,
    endTime: row.endTime,
    slotDurationMinutes: row.slotDurationMinutes,
    capacity: row.capacity,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Public shape of a concrete slot with its computed remaining capacity (AC3). */
function serializeSlot(slot: SlotWithRemaining) {
  return {
    id: slot.id,
    serviceId: slot.serviceId,
    scheduleId: slot.scheduleId,
    slotDate: slot.slotDate,
    startTime: slot.startTime,
    endTime: slot.endTime,
    capacity: slot.capacity,
    bookedCount: slot.bookedCount,
    remainingCapacity: slot.remainingCapacity,
  };
}

/**
 * Service schedule administration + slot read model (P2-E01-S01). All routes are
 * reserved to roles holding `manage service` (admin / super_admin) — schedules
 * are service configuration.
 *
 *   GET    /admin/services/:serviceId/schedules — list schedules for a service
 *   POST   /admin/services/:serviceId/schedules — create a schedule (AC1)
 *   PATCH  /admin/schedules/:id                 — update; soft-retire via isActive (AC4)
 *   GET    /admin/services/:serviceId/slots     — concrete slots + remaining capacity (AC3)
 *
 * Creating or updating a schedule immediately materialises its concrete slots
 * over the rolling horizon (AC2); the nightly cron in `apps/jobs` keeps the
 * window topped up. Re-generation is idempotent and never rewrites an existing
 * slot, so an edit only affects FUTURE slots (AC4). Every mutation writes an
 * `audit_outbox` row (AC5); the acting user is the session user, never the client.
 */
export function registerAdminSchedules(app: FastifyInstance, deps: AdminSchedulesDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const clock = deps.now ?? (() => new Date());
  const today = () => clock().toISOString().slice(0, 10);

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
    if (!can(auth.user.role, "manage", "service")) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  // List schedules for a service.
  app.get(
    "/admin/services/:serviceId/schedules",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply);
      if (!actor) return reply;
      const { serviceId } = req.params as { serviceId: string };
      const service = await getService(db, serviceId);
      if (!service) return reply.code(404).send({ error: "Service not found" });
      const rows = await listSchedules(db, { serviceId });
      return reply.code(200).send({ schedules: rows.map(serializeSchedule) });
    },
  );

  // Create a schedule (AC1) and materialise its slots over the horizon (AC2).
  app.post(
    "/admin/services/:serviceId/schedules",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply);
      if (!actor) return reply;
      const { serviceId } = req.params as { serviceId: string };
      const service = await getService(db, serviceId);
      if (!service) return reply.code(404).send({ error: "Service not found" });
      // Don't materialise bookable availability for a retired service.
      if (!service.isActive) {
        return reply.code(409).send({ error: "Cannot schedule a retired (inactive) service" });
      }
      const parsed = scheduleCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
      }
      const fromDate = today();
      // Create the schedule, materialise its slots, and audit atomically (AC5).
      const row = await db.transaction(async (tx) => {
        const created = await createSchedule(tx, { serviceId, ...parsed.data });
        await generateSlotsForSchedule(tx, created, { fromDate });
        await audit(tx, {
          actor: actor.id,
          action: "catalog.schedule.create",
          target: { table: "service_schedules", id: created.id },
          payload: {
            service_id: serviceId,
            day_of_week: created.dayOfWeek,
            start_time: created.startTime,
            end_time: created.endTime,
            slot_duration_minutes: created.slotDurationMinutes,
            capacity: created.capacity,
            ip: req.ip,
          },
        });
        return created;
      });
      return reply.code(201).send(serializeSchedule(row));
    },
  );

  // Update a schedule (AC4). Soft-retire via isActive=false. Re-materialises
  // future slots (idempotent — existing/booked slots keep their snapshot).
  app.patch("/admin/schedules/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const existing = await getSchedule(db, id);
    if (!existing) return reply.code(404).send({ error: "Schedule not found" });
    const parsed = scheduleUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    // The update schema validates the patch in isolation; re-check the window
    // invariants against the MERGED row so a partial edit (e.g. only endTime, or
    // only slotDurationMinutes) can't leave start>=end or a slot that doesn't fit
    // the window — which would otherwise silently materialise zero slots or hit a
    // raw DB CHECK (500). Return a clean 400 instead.
    const merged = {
      startTime: parsed.data.startTime ?? existing.startTime,
      endTime: parsed.data.endTime ?? existing.endTime,
      slotDurationMinutes: parsed.data.slotDurationMinutes ?? existing.slotDurationMinutes,
    };
    if (hmToMinutes(merged.startTime) >= hmToMinutes(merged.endTime)) {
      return reply.code(400).send({ error: "endTime must be after startTime", field: "endTime" });
    }
    if (merged.slotDurationMinutes > hmToMinutes(merged.endTime) - hmToMinutes(merged.startTime)) {
      return reply
        .code(400)
        .send({ error: "slotDurationMinutes must fit within the start–end window", field: "slotDurationMinutes" });
    }

    const fromDate = today();
    // Update, reconcile future slots (withdraw stale/retired-rule unbooked slots,
    // re-materialise the current rule — booked slots keep their snapshot, AC4),
    // and audit atomically (AC5).
    const row = await db.transaction(async (tx) => {
      const updated = await updateSchedule(tx, id, parsed.data);
      if (!updated) return null;
      await resyncScheduleSlots(tx, updated, { fromDate });
      await audit(tx, {
        actor: actor.id,
        action: "catalog.schedule.update",
        target: { table: "service_schedules", id },
        payload: { changes: parsed.data, ip: req.ip },
      });
      return updated;
    });
    if (!row) return reply.code(404).send({ error: "Schedule not found" });
    return reply.code(200).send(serializeSchedule(row));
  });

  // Concrete slots for a service with computed remaining capacity (AC3).
  // Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD bound the window (inclusive).
  app.get("/admin/services/:serviceId/slots", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { serviceId } = req.params as { serviceId: string };
    const service = await getService(db, serviceId);
    if (!service) return reply.code(404).send({ error: "Service not found" });
    const { from, to } = (req.query ?? {}) as { from?: string; to?: string };
    // Validate date params before they reach the SQL date comparison (a malformed
    // value would otherwise surface as a 500 rather than a clean 400).
    if (from !== undefined && !ISO_DATE_RE.test(from)) {
      return reply.code(400).send({ error: "from must be YYYY-MM-DD", field: "from" });
    }
    if (to !== undefined && !ISO_DATE_RE.test(to)) {
      return reply.code(400).send({ error: "to must be YYYY-MM-DD", field: "to" });
    }
    const slots = await listSlotsWithRemaining(db, { serviceId, fromDate: from, toDate: to });
    return reply.code(200).send({ slots: slots.map(serializeSlot) });
  });
}
