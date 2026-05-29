import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { children, parents, users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import {
  ageInMonths,
  slotFitsAge,
  AVAILABILITY_WINDOW_DAYS,
  type AvailableSlot,
  type BookableService,
  type ServiceAvailability,
  type ServiceUnit,
} from "@bm/contracts";
import { browseServiceSlots, getService, listServices, type BrowseSlot } from "@bm/catalog";
import type { ParentsDeps } from "./index.js";

export interface AvailabilityRoutesDeps extends ParentsDeps {
  /** Clock for deterministic "today"/"now" in tests. Defaults to real time. */
  now?: () => Date;
}

/** Resolve a session userId to its live id+role. */
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

function serializeSlot(slot: BrowseSlot): AvailableSlot {
  return {
    id: slot.id,
    slotDate: slot.slotDate,
    startTime: slot.startTime,
    endTime: slot.endTime,
    capacity: slot.capacity,
    remainingCapacity: slot.remainingCapacity,
    isPast: slot.isPast,
    available: slot.available,
  };
}

/**
 * Parent slot-availability browse (P2-E01-S02). Read-only; scoped to the
 * authenticated parent and their own child.
 *
 *   GET /parents/me/services/:serviceId/availability?childId=…
 *     → the service's bookable slots over the next {@link AVAILABILITY_WINDOW_DAYS}
 *       days, each with remaining capacity (AC1) and an isPast/available flag
 *       (AC3). Slots are returned only when the child's age fits the service's
 *       range (AC2); otherwise `eligible:false` and an empty list.
 *
 * Reads are not audited (per the audit catalogue). The query is index-backed by
 * `session_slots (service_id, slot_date)` to meet the ≤500ms p95 target (AC4).
 */
export function registerParentAvailability(
  app: FastifyInstance,
  deps: AvailabilityRoutesDeps,
): void {
  const { db, sessions } = deps;
  const clock = deps.now ?? (() => new Date());
  const resolveUser = makeResolveUser(db);

  async function requireParentId(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
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
    return profile.id;
  }

  // The active services a parent can browse + book — the `/book` listing's entry
  // point (P2-E01-S02 AC1: the parent reaches a service detail from here).
  app.get("/parents/me/bookable-services", async (req: FastifyRequest, reply: FastifyReply) => {
    const parentId = await requireParentId(req, reply);
    if (!parentId) return reply;
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

  app.get(
    "/parents/me/services/:serviceId/availability",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parentId = await requireParentId(req, reply);
      if (!parentId) return reply;

      const { serviceId } = req.params as { serviceId: string };
      const { childId } = (req.query ?? {}) as { childId?: string };
      if (!childId) return reply.code(400).send({ error: "childId is required", field: "childId" });

      // The child must belong to this parent AND not be archived — never reveal a
      // stranger's child, and a soft-deleted child isn't bookable.
      const [child] = await db.select().from(children).where(eq(children.id, childId));
      if (!child || child.parentId !== parentId || child.archivedAt !== null) {
        return reply.code(404).send({ error: "Child not found" });
      }
      const service = await getService(db, serviceId);
      if (!service || !service.isActive) return reply.code(404).send({ error: "Service not found" });

      const now = clock();
      const today = now.toISOString().slice(0, 10);
      const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      const ageMonths = ageInMonths(child.dateOfBirth, now);
      const eligible = slotFitsAge(ageMonths, service.ageMinMonths, service.ageMaxMonths);

      const slots = eligible
        ? await browseServiceSlots(db, {
            serviceId,
            fromDate: today,
            days: AVAILABILITY_WINDOW_DAYS,
            today,
            nowMinutes,
          })
        : [];

      const body: ServiceAvailability = {
        serviceId,
        childId,
        windowStart: today,
        ageMonths,
        ageMinMonths: service.ageMinMonths,
        ageMaxMonths: service.ageMaxMonths,
        eligible,
        slots: slots.map(serializeSlot),
      };
      return reply.code(200).send(body);
    },
  );
}
