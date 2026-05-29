import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import {
  bookings,
  children,
  observations,
  parents,
  services,
  users,
  type Database,
} from "@bm/db";
import { validateSession } from "@bm/auth";
import { OBSERVATION_FEED_LIMIT, type ObservationFeedItem } from "@bm/contracts";
import type { ParentsDeps } from "./index.js";

function makeResolveUser(db: Database) {
  return async (userId: string) => {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return u ? { id: u.id, role: u.role } : null;
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Observations feed in the parent's account (P2-E03-S04). Read-only (AC3): a
 * per-child timeline of hand-off observations — mood, activities, free-text note,
 * attendant name, date (AC1) — filterable by date range + service (AC2).
 * Ownership is derived server-side (the child must belong to the session
 * parent). Anonymised rows (S05 NULLs `child_id`) naturally fall out of the
 * per-child query, so the feed only ever shows still-identifiable visits.
 *
 *  GET /parents/me/children/:childId/observations?from=&to=&serviceId=
 */
export function registerParentObservations(app: FastifyInstance, deps: ParentsDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  app.get(
    "/parents/me/children/:childId/observations",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const auth = await validateSession(
        { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: null },
        { sessions, resolveUser },
      );
      if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
      const [profile] = await db.select().from(parents).where(eq(parents.userId, auth.user.id));
      if (!profile) return reply.code(404).send({ error: "Parent profile not found" });

      const { childId } = req.params as { childId: string };
      const [child] = await db.select().from(children).where(eq(children.id, childId));
      // Ownership only — an archived (soft-deleted) child's history stays readable
      // on purpose: this is a read-only record the parent owns.
      if (!child || child.parentId !== profile.id) {
        return reply.code(404).send({ error: "Child not found" });
      }

      // Date filters bracket the UTC calendar day (inclusive), consistent with the
      // rest of the platform's date handling. Invalid/garbage params are ignored
      // (no 400) — and a non-uuid serviceId is dropped rather than reaching the
      // uuid column (which would surface as a 500).
      const q = req.query as Record<string, string | string[] | undefined>;
      // A repeated query param (e.g. `?serviceId=a&serviceId=b`) arrives as an
      // array; coerce to the first value before validating. Otherwise String(array)
      // defeats the regex guards and the filter is silently dropped (or an array
      // value reaches a uuid column).
      const firstParam = (v: string | string[] | undefined): string | undefined =>
        Array.isArray(v) ? v[0] : v;
      const from = firstParam(q.from);
      const to = firstParam(q.to);
      const serviceId = firstParam(q.serviceId);
      const conds = [eq(observations.childId, childId)];
      if (from && ISO_DATE.test(from)) {
        conds.push(gte(observations.createdAt, new Date(`${from}T00:00:00.000Z`)));
      }
      if (to && ISO_DATE.test(to)) {
        conds.push(lte(observations.createdAt, new Date(`${to}T23:59:59.999Z`)));
      }
      if (serviceId && UUID.test(serviceId)) {
        conds.push(eq(bookings.serviceId, serviceId));
      }

      const rows = await db
        .select({
          id: observations.id,
          childId: observations.childId,
          mood: observations.mood,
          activities: observations.activities,
          note: observations.note,
          attendantName: observations.attendantNameSnapshot,
          serviceId: services.id,
          serviceName: services.name,
          createdAt: observations.createdAt,
        })
        .from(observations)
        .innerJoin(bookings, eq(observations.bookingId, bookings.id))
        .leftJoin(services, eq(bookings.serviceId, services.id))
        .where(and(...conds))
        .orderBy(desc(observations.createdAt))
        .limit(OBSERVATION_FEED_LIMIT);

      const feed: ObservationFeedItem[] = rows.map((r) => ({
        id: r.id,
        // r.childId is always `childId` here (the WHERE pins it); the coalesce
        // only narrows the nullable column type to the contract's `string`.
        childId: r.childId ?? childId,
        mood: r.mood,
        activities: r.activities ?? [],
        note: r.note,
        attendantName: r.attendantName,
        serviceId: r.serviceId,
        serviceName: r.serviceName,
        date: r.createdAt.toISOString(),
      }));
      return reply.code(200).send({ observations: feed });
    },
  );
}
