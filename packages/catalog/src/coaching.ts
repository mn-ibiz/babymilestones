import { and, asc, eq, gte, inArray, isNotNull, lte, ne, notInArray, sql } from "drizzle-orm";
import {
  audit,
  bookings,
  coachingSlots,
  invoices,
  services,
  staff,
  staffAvailability,
  type CoachingSlotRow,
  type Database,
  type StaffAvailabilityRow,
} from "@bm/db";
import { addDaysIso, dayOfWeekIso, slotWindows } from "./schedules.js";
import { availabilityCoversDate, listStaffAvailability } from "./salon.js";
import { resolveServicePriceAt, type Executor } from "./services.js";

/**
 * P5-E01-S02 (Story 31.2) — Coach availability + 1:1 booking. REUSES the salon
 * slot machinery (P3-E03-S01/S02) for the COACHING unit, with a STRICT capacity of
 * 1: a 1:1 session holds its slot PRIVATELY, so a booked slot is unavailable to
 * everyone else (AC3).
 *
 * Two layers, mirroring the booking engine + the salon flow:
 *  - Coach availability REUSES the GENERIC `staff_availability` table (the same
 *    weekly TEMPLATE mechanism as P3-E03-S01, AC1) — no new availability table.
 *  - `coaching_slots` is the concrete, bookable MATERIALISATION — one row per
 *    (coach availability × coaching offering × date × window) for a rolling future
 *    horizon, regenerated nightly.
 *
 * The generator is FUTURE-ONLY and idempotent: it never mutates or deletes a slot
 * that is in the past or already booked, so editing availability changes only
 * future, not-yet-booked slots.
 */

/** How many days ahead a coach availability is materialised into concrete slots (AC1). */
export const COACHING_SLOT_HORIZON_DAYS = 60;

/** Max rows per `INSERT … VALUES` batch — same ceiling-guard as the salon generator. */
const COACHING_SLOT_INSERT_CHUNK = 500;

/* --- Coaching offering durations (AC1 input) ----------------------------- */

/** A coaching offering the generator materialises slots for: id + slot duration + seats. */
export interface CoachingOfferingDuration {
  id: string;
  /** Session length in minutes (> 0). */
  coachingDurationMinutes: number;
  /**
   * Seats per generated slot (P5-E01-S03 / Story 31.3 AC1). Omitted/undefined =
   * 1 (a 1:1 private hold); a group offering carries N (> 1). Snapshotted onto
   * each generated slot.
   */
  capacity?: number;
}

/** A coaching offering's group capacity, treating null/unset/<1 as a 1:1 hold (capacity 1). */
function offeringCapacity(coachingCapacity: number | null): number {
  return coachingCapacity != null && coachingCapacity > 1 ? coachingCapacity : 1;
}

/**
 * Load the ACTIVE coaching offerings that carry a positive duration — the
 * catalogue the nightly generator crosses with every active coach availability
 * (AC1). A coaching offering with no duration set (null) is not yet bookable as
 * discrete slots and is skipped. Each offering carries its group `capacity`
 * (P5-E01-S03 AC1): 1 for a 1:1 offering, N for a group offering.
 */
export async function listCoachingOfferingDurations(db: Executor): Promise<CoachingOfferingDuration[]> {
  const rows = await db
    .select({
      id: services.id,
      coachingDurationMinutes: services.coachingDurationMinutes,
      coachingCapacity: services.coachingCapacity,
      isActive: services.isActive,
      unit: services.unit,
    })
    .from(services)
    .where(eq(services.unit, "coaching"));
  return rows
    .filter(
      (r): r is typeof r & { coachingDurationMinutes: number } =>
        r.isActive && r.coachingDurationMinutes !== null && r.coachingDurationMinutes > 0,
    )
    .map((r) => ({
      id: r.id,
      coachingDurationMinutes: r.coachingDurationMinutes,
      capacity: offeringCapacity(r.coachingCapacity),
    }));
}

/* --- Coaching slot materialisation (AC1) --------------------------------- */

/** The calendar dates a coaching slot is generated for. */
function coachingSlotDates(
  availability: StaffAvailabilityRow,
  fromDate: string,
  days: number,
): string[] {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysIso(fromDate, i);
    if (dayOfWeekIso(date) !== availability.dayOfWeek) continue;
    if (!availabilityCoversDate(availability.effectiveFrom, availability.effectiveTo, date)) {
      continue;
    }
    dates.push(date);
  }
  return dates;
}

export interface GenerateCoachingSlotsOpts {
  /** First date of the generation horizon (`YYYY-MM-DD`). Slots are future-only. */
  fromDate: string;
  /** Horizon length in days. Defaults to {@link COACHING_SLOT_HORIZON_DAYS}. */
  days?: number;
  /** The coaching offerings to materialise slots for (id + duration). */
  services: CoachingOfferingDuration[];
}

/**
 * Materialise a coach availability into concrete `coaching_slots` over `[fromDate,
 * fromDate + days)` — one slot-set per coaching offering, the availability window
 * chopped into back-to-back slots of each offering's duration (AC1). A partial
 * trailing window that would overrun `endTime` is dropped (reuses
 * {@link slotWindows}).
 *
 * Idempotent: the `(availability_id, service_id, slot_date, start_time)` unique
 * index means re-running NEVER duplicates and NEVER rewrites an existing slot — so
 * a generated/booked slot keeps its duration snapshot. Inactive availabilities
 * generate nothing. Returns the number of NEW slots inserted.
 */
export async function generateCoachingSlotsForAvailability(
  db: Executor,
  availability: StaffAvailabilityRow,
  opts: GenerateCoachingSlotsOpts,
): Promise<number> {
  if (!availability.isActive) return 0;
  if (opts.services.length === 0) return 0;
  const days = opts.days ?? COACHING_SLOT_HORIZON_DAYS;
  const dates = coachingSlotDates(availability, opts.fromDate, days);
  if (dates.length === 0) return 0;

  const values: {
    staffId: string;
    serviceId: string;
    availabilityId: string;
    slotDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    capacity: number;
  }[] = [];
  for (const service of opts.services) {
    const windows = slotWindows(
      availability.startTime,
      availability.endTime,
      service.coachingDurationMinutes,
    );
    if (windows.length === 0) continue;
    // Seats SNAPSHOT (AC1): 1 for a 1:1 offering, N (> 1) for a group offering.
    const capacity = service.capacity != null && service.capacity > 1 ? service.capacity : 1;
    for (const slotDate of dates) {
      for (const w of windows) {
        values.push({
          staffId: availability.staffId,
          serviceId: service.id,
          availabilityId: availability.id,
          slotDate,
          startTime: w.startTime,
          endTime: w.endTime,
          // Duration SNAPSHOT taken at generation time.
          durationMinutes: service.coachingDurationMinutes,
          // Seats SNAPSHOT taken at generation time (P5-E01-S03 AC1).
          capacity,
        });
      }
    }
  }
  if (values.length === 0) return 0;

  let insertedCount = 0;
  for (let i = 0; i < values.length; i += COACHING_SLOT_INSERT_CHUNK) {
    const inserted = await db
      .insert(coachingSlots)
      .values(values.slice(i, i + COACHING_SLOT_INSERT_CHUNK))
      .onConflictDoNothing({
        target: [
          coachingSlots.availabilityId,
          coachingSlots.serviceId,
          coachingSlots.slotDate,
          coachingSlots.startTime,
        ],
      })
      .returning({ id: coachingSlots.id });
    insertedCount += inserted.length;
  }
  return insertedCount;
}

/**
 * Withdraw a coach availability's FUTURE coaching slots (`slotDate >= fromDate`)
 * that NO booking consumes, leaving booked slots — and ALL past slots — untouched.
 * Used when an availability's window/day/range changes or it is retired. Returns
 * the number of slots deleted.
 */
export async function deleteFutureUnbookedCoachingSlots(
  db: Executor,
  availabilityId: string,
  fromDate: string,
): Promise<number> {
  const bookedCoachingSlotIds = db
    .select({ id: bookings.coachingSlotId })
    .from(bookings)
    .where(isNotNull(bookings.coachingSlotId));
  const deleted = await db
    .delete(coachingSlots)
    .where(
      and(
        eq(coachingSlots.availabilityId, availabilityId),
        gte(coachingSlots.slotDate, fromDate),
        notInArray(coachingSlots.id, bookedCoachingSlotIds),
      ),
    )
    .returning({ id: coachingSlots.id });
  return deleted.length;
}

/**
 * Reconcile a coach availability's concrete slots after an edit: first withdraw
 * the future UNBOOKED slots that no longer match the rule (or all of them, when
 * the availability is retired), then re-materialise the current rule. Booked +
 * past slots keep their snapshot. Idempotent. Returns the number of slots
 * (re)generated.
 */
export async function resyncCoachAvailabilitySlots(
  db: Executor,
  availability: StaffAvailabilityRow,
  opts: GenerateCoachingSlotsOpts,
): Promise<number> {
  await deleteFutureUnbookedCoachingSlots(db, availability.id, opts.fromDate);
  return generateCoachingSlotsForAvailability(db, availability, opts);
}

/**
 * Regenerate concrete coaching slots for EVERY active coach availability × every
 * active coaching offering over the horizon (the nightly cron's unit of work,
 * AC1). Purely additive — it never prunes, so past/booked slots are never
 * disturbed. Returns the total number of new slots inserted across all
 * availabilities.
 *
 * Note: `staff_availability` is generic, so it also holds stylist rules. The
 * generator crosses every availability with the COACHING offerings only — a
 * stylist with no coaching offering simply contributes nothing, and a coach with
 * no availability contributes nothing. The (availability, coaching service)
 * keying keeps coaching slots disjoint from salon slots.
 */
export async function regenerateCoachingSlots(
  db: Executor,
  opts: { fromDate: string; days?: number },
): Promise<number> {
  const [availabilities, coachingOfferings] = await Promise.all([
    listStaffAvailability(db, { activeOnly: true }),
    listCoachingOfferingDurations(db),
  ]);
  if (coachingOfferings.length === 0) return 0;
  let total = 0;
  for (const availability of availabilities) {
    total += await generateCoachingSlotsForAvailability(db, availability, {
      fromDate: opts.fromDate,
      days: opts.days,
      services: coachingOfferings,
    });
  }
  return total;
}

/* --- Coaching slot read model -------------------------------------------- */

/**
 * List concrete coaching slots, ordered by date then start time. Filter by
 * `staffId`, `serviceId`, and/or a `[fromDate, toDate]` (inclusive) window.
 */
export async function listCoachingSlots(
  db: Executor,
  opts: { staffId?: string; serviceId?: string; fromDate?: string; toDate?: string } = {},
): Promise<CoachingSlotRow[]> {
  const filters = [];
  if (opts.staffId !== undefined) filters.push(eq(coachingSlots.staffId, opts.staffId));
  if (opts.serviceId !== undefined) filters.push(eq(coachingSlots.serviceId, opts.serviceId));
  if (opts.fromDate !== undefined) filters.push(gte(coachingSlots.slotDate, opts.fromDate));
  if (opts.toDate !== undefined) filters.push(lte(coachingSlots.slotDate, opts.toDate));
  const where =
    filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);
  return db
    .select()
    .from(coachingSlots)
    .where(where)
    .orderBy(asc(coachingSlots.slotDate), asc(coachingSlots.startTime));
}

/**
 * The coaching slot ids that have NO open seat — every seat is consumed by a
 * non-cancelled booking (`booked >= capacity`). A 1:1 slot (capacity 1) is full
 * after one booking; a group slot (capacity N) is full after N (P5-E01-S03 AC2).
 * A cancelled booking frees its seat. Used as a `NOT IN` sub-select so the browse
 * read is index-backed and race-free; the confirm path re-checks under a lock.
 */
function fullCoachingSlotIdsSubquery(db: Executor) {
  return db
    .select({ id: bookings.coachingSlotId })
    .from(bookings)
    .innerJoin(coachingSlots, eq(bookings.coachingSlotId, coachingSlots.id))
    .where(and(isNotNull(bookings.coachingSlotId), ne(bookings.status, "cancelled")))
    .groupBy(bookings.coachingSlotId, coachingSlots.capacity)
    .having(sql`count(*) >= ${coachingSlots.capacity}`);
}

/**
 * List the AVAILABLE coaching slots for an offering over a date window (AC2):
 * future slots for `serviceId` that still have an OPEN SEAT, ordered by date then
 * start time. A capacity-1 (1:1) slot is offered until its single seat is taken; a
 * group slot is offered until all N seats are taken (P5-E01-S03 AC2). When
 * `staffId` is supplied, only that coach's slots are returned (AC2).
 * `fromDate`/`toDate` are inclusive `YYYY-MM-DD` bounds; pass `fromDate = today` to
 * hide past dates.
 */
export async function listAvailableCoachingSlots(
  db: Executor,
  opts: { serviceId: string; staffId?: string; fromDate?: string; toDate?: string },
): Promise<CoachingSlotRow[]> {
  const filters = [
    eq(coachingSlots.serviceId, opts.serviceId),
    notInArray(coachingSlots.id, fullCoachingSlotIdsSubquery(db)),
  ];
  if (opts.staffId !== undefined) filters.push(eq(coachingSlots.staffId, opts.staffId));
  if (opts.fromDate !== undefined) filters.push(gte(coachingSlots.slotDate, opts.fromDate));
  if (opts.toDate !== undefined) filters.push(lte(coachingSlots.slotDate, opts.toDate));
  return db
    .select()
    .from(coachingSlots)
    .where(and(...filters))
    .orderBy(asc(coachingSlots.slotDate), asc(coachingSlots.startTime));
}

/** A coaching slot decorated with its live booking count + seats remaining (AC2). */
export type CoachingSlotWithSeats = CoachingSlotRow & {
  /** Non-cancelled bookings consuming the slot. */
  bookedCount: number;
  /** Seats still open: `capacity − bookedCount`, clamped ≥ 0 (AC2). */
  seatsRemaining: number;
};

/** Count the non-cancelled bookings consuming each of the given coaching slot ids. */
async function coachingBookingCountsBySlot(
  db: Executor,
  slotIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (slotIds.length === 0) return counts;
  const rows = await db
    .select({ slotId: bookings.coachingSlotId, n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(inArray(bookings.coachingSlotId, slotIds), ne(bookings.status, "cancelled")))
    .groupBy(bookings.coachingSlotId);
  for (const r of rows) {
    if (r.slotId) counts.set(r.slotId, Number(r.n));
  }
  return counts;
}

/** Decorate a coaching slot with its booked count + seats remaining (clamped ≥ 0). */
function withSeats(slot: CoachingSlotRow, booked: number): CoachingSlotWithSeats {
  return { ...slot, bookedCount: booked, seatsRemaining: Math.max(0, slot.capacity - booked) };
}

/**
 * List AVAILABLE coaching slots WITH their seats remaining (P5-E01-S03 AC2): the
 * same future, not-yet-full slots as {@link listAvailableCoachingSlots}, each
 * decorated with `capacity`, `bookedCount`, and `seatsRemaining = capacity −
 * booked`. The parent UI renders "X seats left"; a full slot is already excluded.
 */
export async function listAvailableCoachingSlotsWithSeats(
  db: Executor,
  opts: { serviceId: string; staffId?: string; fromDate?: string; toDate?: string },
): Promise<CoachingSlotWithSeats[]> {
  const slots = await listAvailableCoachingSlots(db, opts);
  const counts = await coachingBookingCountsBySlot(
    db,
    slots.map((s) => s.id),
  );
  return slots.map((s) => withSeats(s, counts.get(s.id) ?? 0));
}

/* --- Parent 1:1 coaching booking (AC2/AC3/AC4) --------------------------- */

/** The coaching slot id is unknown. */
export class CoachingSlotNotFoundError extends Error {
  constructor(public readonly coachingSlotId: string) {
    super(`Coaching slot not found: ${coachingSlotId}`);
    this.name = "CoachingSlotNotFoundError";
  }
}

/** The coaching slot is already taken — its single seat is gone (AC3 race guard). */
export class CoachingSlotTakenError extends Error {
  constructor(public readonly coachingSlotId: string) {
    super(`Coaching slot already booked: ${coachingSlotId}`);
    this.name = "CoachingSlotTakenError";
  }
}

/**
 * The (group) coaching slot is full — every seat is taken (P5-E01-S03 / Story 31.3
 * AC2 race guard). Thrown only for capacity > 1; a capacity-1 (1:1) slot keeps
 * throwing {@link CoachingSlotTakenError} so existing 1:1 behaviour is identical.
 */
export class CoachingSlotFullError extends Error {
  constructor(
    public readonly coachingSlotId: string,
    public readonly capacity: number,
  ) {
    super(`Coaching session is full (${capacity} seats): ${coachingSlotId}`);
    this.name = "CoachingSlotFullError";
  }
}

/** The coaching offering has no price effective at the slot date — cannot be booked. */
export class CoachingServicePriceMissingError extends Error {
  constructor(public readonly serviceId: string) {
    super(`No effective price for coaching offering: ${serviceId}`);
    this.name = "CoachingServicePriceMissingError";
  }
}

/** The chosen coach does not match the slot's coach (or is unknown/retired). */
export class CoachingCoachMismatchError extends Error {
  constructor() {
    super("The chosen coach is not available for this slot");
    this.name = "CoachingCoachMismatchError";
  }
}

export interface BookCoachingSlotInput {
  coachingSlotId: string;
  parentId: string;
  childId: string;
  /**
   * The coach the parent chose. When omitted/null the slot's own coach is
   * attributed. When supplied it MUST equal the slot's coach (AC2).
   */
  staffId?: string | null;
  /** Acting user id for the audit row (the parent). */
  actor?: string | null;
  /** Request IP for the audit payload. */
  ip?: string | null;
}

export interface BookCoachingSlotResult {
  bookingId: string;
  invoiceId: string;
  serviceId: string;
  coachingSlotId: string;
  /** The coach the booking was attributed to (resolved). */
  staffId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  /** Offering price snapshotted onto the pending invoice (AC4), integer KES cents. */
  amountCents: number;
}

/**
 * Book a SEAT in a coaching slot for a child (AC2/AC3/AC4 + P5-E01-S03). Runs in a
 * transaction that LOCKS the coaching slot row (`SELECT … FOR UPDATE`) before
 * counting the live (non-cancelled) bookings against it, so concurrent bookers
 * serialize on the slot:
 *  - capacity 1 (a 1:1 offering): the first commits, the second is rejected with
 *    {@link CoachingSlotTakenError} (identical to the prior 1:1 behaviour, AC3);
 *  - capacity N (a group offering): each parent books ONE seat; the (N+1)th is
 *    rejected with {@link CoachingSlotFullError} once all seats are taken (AC2).
 * A cancelled prior booking frees its seat. On success it ATTRIBUTES the slot's
 * coach, snapshots the offering's effective price into a new PENDING invoice + the
 * booking's `staffRateSnapshot`, records the booking against
 * `bookings.coachingSlotId`, and audits `booking.created` — all atomically
 * (reusing the P2-E01 invoice + attribution + audit write semantics). Each seat
 * raises its OWN pending invoice (AC3).
 *
 * Throws {@link CoachingSlotNotFoundError} / {@link CoachingSlotTakenError} /
 * {@link CoachingSlotFullError} / {@link CoachingServicePriceMissingError} /
 * {@link CoachingCoachMismatchError}.
 */
export async function bookCoachingSlot(
  db: Database,
  input: BookCoachingSlotInput,
): Promise<BookCoachingSlotResult> {
  return db.transaction(async (tx) => {
    const [slot] = await tx
      .select()
      .from(coachingSlots)
      .where(eq(coachingSlots.id, input.coachingSlotId))
      .for("update");
    if (!slot) throw new CoachingSlotNotFoundError(input.coachingSlotId);

    // A specific coach pick must match the slot's coach (AC2).
    if (input.staffId != null && input.staffId !== slot.staffId) {
      throw new CoachingCoachMismatchError();
    }

    // Seats are checked under the slot lock so concurrent attempts serialize. A
    // cancelled prior booking frees its seat. Capacity 1 → the slot holds ONE
    // private seat (1:1, AC3); capacity N → up to N seats (group, P5-E01-S03 AC2).
    const [{ booked = 0 } = {}] = await tx
      .select({ booked: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(eq(bookings.coachingSlotId, slot.id), ne(bookings.status, "cancelled")));
    if (booked >= slot.capacity) {
      // Capacity-1 keeps the original "taken" error so 1:1 behaviour is unchanged.
      throw slot.capacity <= 1
        ? new CoachingSlotTakenError(slot.id)
        : new CoachingSlotFullError(slot.id, slot.capacity);
    }

    // The attributed coach's display-name snapshot (history-stable, AC4).
    const [coach] = await tx.select().from(staff).where(eq(staff.id, slot.staffId));
    if (!coach || !coach.active) throw new CoachingCoachMismatchError();

    const price = await resolveServicePriceAt(tx, slot.serviceId, slot.slotDate);
    if (!price) throw new CoachingServicePriceMissingError(slot.serviceId);
    const amountCents = price.amountCents;

    const [invoice] = await tx
      .insert(invoices)
      .values({
        parentId: input.parentId,
        amountDue: amountCents,
        serviceId: slot.serviceId,
        status: "pending",
      })
      .returning();
    const [booking] = await tx
      .insert(bookings)
      .values({
        parentId: input.parentId,
        childId: input.childId,
        serviceId: slot.serviceId,
        coachingSlotId: slot.id,
        invoiceId: invoice!.id,
        // Attribution: the slot's coach (AC2/AC4) — drives the commission ledger.
        staffId: slot.staffId,
        staffNameSnapshot: coach.displayName,
        staffRateSnapshot: amountCents,
        paidVia: "wallet",
      })
      .returning();

    // Audit inside the transaction (atomic with the booking — outbox pattern).
    await audit(tx, {
      actor: input.actor ?? null,
      action: "booking.created",
      target: { table: "bookings", id: booking!.id },
      payload: {
        coaching_slot_id: slot.id,
        child_id: input.childId,
        service_id: slot.serviceId,
        staff_id: slot.staffId,
        invoice_id: invoice!.id,
        amount_cents: amountCents,
        ip: input.ip ?? undefined,
      },
    });

    return {
      bookingId: booking!.id,
      invoiceId: invoice!.id,
      serviceId: slot.serviceId,
      coachingSlotId: slot.id,
      staffId: slot.staffId,
      slotDate: slot.slotDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
      amountCents,
    };
  });
}
