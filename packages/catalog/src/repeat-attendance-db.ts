import { and, eq, gte, inArray, lt, ne } from "drizzle-orm";
import {
  attendances,
  bookings,
  events,
  parents,
  services,
  tickets,
  users,
} from "@bm/db";
import type { Executor } from "./services.js";
import {
  aggregateRepeatAttendance,
  type RepeatAttendanceRecord,
  type RepeatAttendanceReport,
} from "./repeat-attendance.js";

/**
 * P6-E06-S03 (Story 35.3) — DB read behind the repeat-attendance report. A thin
 * projection: it assembles the window's attendance records from BOTH "class"
 * signals, then hands them to the pure {@link aggregateRepeatAttendance} reducer.
 * Read-only — not audited.
 *
 * The two signals (and a single, phone-keyed attendee identity so the same person
 * attending a class AND an event is recognised as one parent):
 *
 *  - CLASS BOOKINGS — a non-cancelled booking of a CLASS-type service
 *    (`unit ∈ {talent, coaching}` — the group/cohort offerings, distinct from the
 *    `play` crèche drop-in and the `salon` appointment) that has an attendance
 *    CHECK-IN (`attendances.checkedInAt`) in the window. The class is the booking's
 *    service (one cohort per service); the attendee identity is the parent's login
 *    PHONE (`users.phone` via `parents.userId`).
 *
 *  - EVENT TICKETS — an issued ticket DOOR-CHECKED-IN at the event
 *    (`tickets.status = 'checked_in'`, the P4-E05-S05 door scan) whose
 *    `checkedInAt` is in the window. The class is the event; the attendee identity
 *    is the ticket's `buyerPhone` (guest checkout — no account).
 *
 * The AC2 date filter is applied here at the read seam: class records key on the
 * attendance `checkedInAt`, event records on the ticket `checkedInAt`, both bounded
 * to UTC `[from 00:00, (to+1) 00:00)`. The reducer then computes the per-class
 * repeat-rate + avg-classes math with no I/O (the Epic-27 reporting split).
 */
export interface LoadRepeatAttendanceOpts {
  /** Inclusive lower bound of the window (`YYYY-MM-DD`). */
  from: string;
  /** Inclusive upper bound of the window (`YYYY-MM-DD`). */
  to: string;
}

/** Class-type service units that count as a "class" for this report. */
const CLASS_UNITS = ["talent", "coaching"] as const;

/** `YYYY-MM-DD` → the UTC start of that calendar day. */
function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** `YYYY-MM-DD` → the UTC start of the NEXT calendar day (exclusive upper bound). */
function nextDayStart(date: string): Date {
  return new Date(dayStart(date).getTime() + 24 * 60 * 60 * 1000);
}

/** A `Date` → its UTC calendar day, `YYYY-MM-DD`. */
function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function loadRepeatAttendance(
  db: Executor,
  opts: LoadRepeatAttendanceOpts,
): Promise<RepeatAttendanceReport> {
  const from = dayStart(opts.from);
  const to = nextDayStart(opts.to);

  // CLASS BOOKINGS: attended (checked-in), non-cancelled bookings of a class-type
  // service, joined to the service (class) + the parent's login phone (identity).
  const classRows = await db
    .select({
      phone: users.phone,
      serviceId: bookings.serviceId,
      serviceName: services.name,
      checkedInAt: attendances.checkedInAt,
    })
    .from(attendances)
    .innerJoin(bookings, eq(attendances.bookingId, bookings.id))
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .innerJoin(parents, eq(bookings.parentId, parents.id))
    .innerJoin(users, eq(parents.userId, users.id))
    .where(
      and(
        gte(attendances.checkedInAt, from),
        lt(attendances.checkedInAt, to),
        ne(bookings.status, "cancelled"),
        inArray(services.unit, CLASS_UNITS as unknown as string[]),
      ),
    );

  // EVENT TICKETS: door-checked-in tickets in the window, joined to their event
  // (class). Attendee identity is the ticket's buyer phone (guest, no account).
  const eventRows = await db
    .select({
      phone: tickets.buyerPhone,
      eventId: tickets.eventId,
      eventName: events.name,
      checkedInAt: tickets.checkedInAt,
    })
    .from(tickets)
    .innerJoin(events, eq(tickets.eventId, events.id))
    .where(
      and(
        eq(tickets.status, "checked_in"),
        gte(tickets.checkedInAt, from),
        lt(tickets.checkedInAt, to),
      ),
    );

  const records: RepeatAttendanceRecord[] = [];

  for (const r of classRows) {
    records.push({
      parentId: r.phone,
      classId: `service:${r.serviceId}`,
      classLabel: r.serviceName,
      date: toDay(r.checkedInAt),
    });
  }
  for (const r of eventRows) {
    // checkedInAt is non-null here (status = 'checked_in' + the range bounds).
    records.push({
      parentId: r.phone,
      classId: `event:${r.eventId}`,
      classLabel: r.eventName,
      date: toDay(r.checkedInAt ?? from),
    });
  }

  return aggregateRepeatAttendance({ from: opts.from, to: opts.to, records });
}
