import { and, asc, eq, gte, inArray, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import {
  audit,
  bookings,
  invoices,
  serviceSchedules,
  sessionSlots,
  type Database,
  type ServiceScheduleRow,
  type SessionSlotRow,
} from "@bm/db";
import { resolveServicePriceAt, type Executor } from "./services.js";

/**
 * P2-E01-S01 — time-slot model + capacity for services.
 *
 * Two layers:
 *  - `service_schedules` is the recurring weekly TEMPLATE (on `dayOfWeek`, between
 *    `startTime`/`endTime`, offer `slotDurationMinutes` slots each holding `capacity`).
 *  - `session_slots` is the concrete, bookable MATERIALISATION — one row per
 *    (date × window) for a rolling horizon, regenerated nightly by the cron in
 *    `apps/jobs`.
 *
 * `remaining_capacity` is never stored: it is `capacity − bookings_in_slot`,
 * computed at read time (AC3).
 */

/** How many days ahead a schedule is materialised into concrete slots (AC2). */
export const SLOT_GENERATION_HORIZON_DAYS = 60;

/**
 * Max rows per `INSERT … VALUES` batch. Each slot row binds ~6 parameters, so we
 * stay well under Postgres' 65535 bind-parameter ceiling even for a full-day
 * schedule with short slots over the whole horizon.
 */
const SLOT_INSERT_CHUNK = 500;

const HM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/u;

/** "HH:MM" 24h wall-clock → minutes since midnight. Throws on malformed input. */
export function hmToMinutes(hm: string): number {
  const m = HM_REGEX.exec(hm);
  if (!m) throw new RangeError(`invalid HH:MM time: ${hm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes since midnight → zero-padded "HH:MM". */
export function minutesToHm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** One concrete slot window within a schedule's daily availability. */
export interface SlotWindow {
  startTime: string;
  endTime: string;
}

/**
 * Enumerate the non-overlapping slot windows a schedule yields in a single day.
 * Windows start at `startTime` and advance by `slotDurationMinutes`; a partial
 * trailing window that would run past `endTime` is dropped (AC2). Returns `[]`
 * when no whole slot fits.
 */
export function slotWindows(
  startTime: string,
  endTime: string,
  slotDurationMinutes: number,
): SlotWindow[] {
  if (slotDurationMinutes <= 0) return [];
  const start = hmToMinutes(startTime);
  const end = hmToMinutes(endTime);
  const windows: SlotWindow[] = [];
  for (let from = start; from + slotDurationMinutes <= end; from += slotDurationMinutes) {
    windows.push({ startTime: minutesToHm(from), endTime: minutesToHm(from + slotDurationMinutes) });
  }
  return windows;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse a `YYYY-MM-DD` calendar date to a UTC-midnight epoch (ms). */
function isoDateToUtc(dateIso: string): number {
  if (!ISO_DATE_REGEX.test(dateIso)) throw new RangeError(`invalid YYYY-MM-DD date: ${dateIso}`);
  const ms = Date.parse(`${dateIso}T00:00:00.000Z`);
  if (Number.isNaN(ms)) throw new RangeError(`invalid calendar date: ${dateIso}`);
  return ms;
}

/** Add `days` to a `YYYY-MM-DD` date, returning a `YYYY-MM-DD` date (UTC math). */
export function addDaysIso(dateIso: string, days: number): string {
  return new Date(isoDateToUtc(dateIso) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Day-of-week (0=Sun..6=Sat) of a `YYYY-MM-DD` date, using UTC to avoid TZ drift. */
export function dayOfWeekIso(dateIso: string): number {
  return new Date(isoDateToUtc(dateIso)).getUTCDay();
}

/**
 * The calendar dates in the window `[fromDate, fromDate + days)` whose weekday
 * equals `dayOfWeek` (0=Sun..6=Sat). Used to expand a recurring schedule into
 * concrete slot dates over the generation horizon.
 */
export function enumerateSlotDates(fromDate: string, days: number, dayOfWeek: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysIso(fromDate, i);
    if (dayOfWeekIso(date) === dayOfWeek) dates.push(date);
  }
  return dates;
}

/* --- Schedule CRUD (AC1 / AC4) ------------------------------------------- */

export interface CreateScheduleInput {
  serviceId: string;
  /** 0 = Sunday .. 6 = Saturday. */
  dayOfWeek: number;
  /** Window start, `HH:MM` 24h. */
  startTime: string;
  /** Window end, `HH:MM` 24h (after `startTime`). */
  endTime: string;
  /** Length of each generated slot in minutes (> 0). */
  slotDurationMinutes: number;
  /** Children per slot (>= 0). */
  capacity: number;
  /** Defaults to active. */
  isActive?: boolean;
}

/** Create a recurring availability schedule (AC1). Active by default. */
export async function createSchedule(db: Executor, input: CreateScheduleInput) {
  const [row] = await db
    .insert(serviceSchedules)
    .values({
      serviceId: input.serviceId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      slotDurationMinutes: input.slotDurationMinutes,
      capacity: input.capacity,
      isActive: input.isActive ?? true,
    })
    .returning();
  return row!;
}

export interface UpdateScheduleInput {
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  slotDurationMinutes?: number;
  capacity?: number;
  /** Soft-retire via `isActive = false` — schedules are never hard-deleted. */
  isActive?: boolean;
}

/**
 * Update a schedule (AC4). Partial patch. Edits change only FUTURE generated
 * slots — already-materialised `session_slots` keep their capacity snapshot and
 * are never rewritten by {@link generateSlotsForSchedule}. Returns the updated
 * row or null when the id is unknown.
 */
export async function updateSchedule(db: Executor, id: string, patch: UpdateScheduleInput) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.dayOfWeek !== undefined) set.dayOfWeek = patch.dayOfWeek;
  if (patch.startTime !== undefined) set.startTime = patch.startTime;
  if (patch.endTime !== undefined) set.endTime = patch.endTime;
  if (patch.slotDurationMinutes !== undefined) set.slotDurationMinutes = patch.slotDurationMinutes;
  if (patch.capacity !== undefined) set.capacity = patch.capacity;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  const [row] = await db
    .update(serviceSchedules)
    .set(set)
    .where(eq(serviceSchedules.id, id))
    .returning();
  return row ?? null;
}

/** Read one schedule by id, or null. */
export async function getSchedule(db: Executor, id: string) {
  const [row] = await db.select().from(serviceSchedules).where(eq(serviceSchedules.id, id));
  return row ?? null;
}

/** List schedules for a service (or all), newest first. `activeOnly` filters retired rules. */
export async function listSchedules(
  db: Executor,
  opts: { serviceId?: string; activeOnly?: boolean } = {},
) {
  const filters = [];
  if (opts.serviceId !== undefined) filters.push(eq(serviceSchedules.serviceId, opts.serviceId));
  if (opts.activeOnly) filters.push(eq(serviceSchedules.isActive, true));
  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);
  return db
    .select()
    .from(serviceSchedules)
    .where(where)
    .orderBy(asc(serviceSchedules.dayOfWeek), asc(serviceSchedules.startTime));
}

/* --- Slot materialisation (AC2 / AC4) ------------------------------------ */

/**
 * Materialise a schedule into concrete `session_slots` over `[fromDate, fromDate
 * + days)` (AC2). Idempotent: the `(schedule_id, slot_date, start_time)` unique
 * index means re-running NEVER duplicates and NEVER rewrites an existing slot —
 * so a prior capacity edit on a generated/booked slot survives (AC4). Inactive
 * schedules generate nothing. Returns the number of NEW slots inserted.
 */
export async function generateSlotsForSchedule(
  db: Executor,
  schedule: ServiceScheduleRow,
  opts: { fromDate: string; days?: number },
): Promise<number> {
  if (!schedule.isActive) return 0;
  const days = opts.days ?? SLOT_GENERATION_HORIZON_DAYS;
  const windows = slotWindows(schedule.startTime, schedule.endTime, schedule.slotDurationMinutes);
  if (windows.length === 0) return 0;
  const dates = enumerateSlotDates(opts.fromDate, days, schedule.dayOfWeek);
  if (dates.length === 0) return 0;

  const values = dates.flatMap((slotDate) =>
    windows.map((w) => ({
      serviceId: schedule.serviceId,
      scheduleId: schedule.id,
      slotDate,
      startTime: w.startTime,
      endTime: w.endTime,
      // Capacity SNAPSHOT taken at generation time (AC4).
      capacity: schedule.capacity,
    })),
  );

  // Insert in chunks so a full-day schedule with short slots over the 60-day
  // horizon never overruns Postgres' bind-parameter ceiling.
  let insertedCount = 0;
  for (let i = 0; i < values.length; i += SLOT_INSERT_CHUNK) {
    const inserted = await db
      .insert(sessionSlots)
      .values(values.slice(i, i + SLOT_INSERT_CHUNK))
      .onConflictDoNothing({
        target: [sessionSlots.scheduleId, sessionSlots.slotDate, sessionSlots.startTime],
      })
      .returning({ id: sessionSlots.id });
    insertedCount += inserted.length;
  }
  return insertedCount;
}

/**
 * Withdraw a schedule's FUTURE slots (`slotDate >= fromDate`) that NO booking
 * consumes, leaving booked slots untouched (their capacity snapshot + history
 * survive). Used when a schedule's window/day changes or it is retired so stale
 * availability is removed while booked slots are preserved (AC4). Returns the
 * number of slots deleted.
 */
export async function deleteFutureUnbookedSlots(
  db: Executor,
  scheduleId: string,
  fromDate: string,
): Promise<number> {
  // Slot ids that a booking still references — these must never be deleted.
  const bookedSlotIds = db
    .select({ id: bookings.slotId })
    .from(bookings)
    .where(isNotNull(bookings.slotId));
  const deleted = await db
    .delete(sessionSlots)
    .where(
      and(
        eq(sessionSlots.scheduleId, scheduleId),
        gte(sessionSlots.slotDate, fromDate),
        notInArray(sessionSlots.id, bookedSlotIds),
      ),
    )
    .returning({ id: sessionSlots.id });
  return deleted.length;
}

/**
 * Reconcile a schedule's concrete slots after an edit (AC4): first withdraw the
 * future UNBOOKED slots that no longer match the rule (or all of them, when the
 * schedule has been retired), then re-materialise the current rule. Booked slots
 * keep their snapshot. Idempotent. Returns the number of slots (re)generated.
 *
 * This is the mutation-path counterpart to {@link regenerateActiveSlots} (the
 * nightly cron stays purely additive — it never prunes).
 */
export async function resyncScheduleSlots(
  db: Executor,
  schedule: ServiceScheduleRow,
  opts: { fromDate: string; days?: number },
): Promise<number> {
  await deleteFutureUnbookedSlots(db, schedule.id, opts.fromDate);
  return generateSlotsForSchedule(db, schedule, opts);
}

/**
 * Regenerate concrete slots for EVERY active schedule over the horizon (the
 * nightly cron's unit of work, AC2). Returns the total number of new slots
 * inserted across all schedules.
 */
export async function regenerateActiveSlots(
  db: Executor,
  opts: { fromDate: string; days?: number },
): Promise<number> {
  const schedules = await listSchedules(db, { activeOnly: true });
  let total = 0;
  for (const schedule of schedules) {
    total += await generateSlotsForSchedule(db, schedule, opts);
  }
  return total;
}

/* --- Remaining-capacity read model (AC3) --------------------------------- */

/** A concrete slot decorated with its live booking count + remaining capacity. */
export type SlotWithRemaining = SessionSlotRow & {
  bookedCount: number;
  remainingCapacity: number;
};

/**
 * Count the bookings consuming each of the given slot ids.
 *
 * This counts every booking whose `slot_id` matches. The booking WRITE path is a
 * later story: the booking flow (P2-E01-S03) MUST enforce capacity inside a
 * transaction that locks the slot row (`SELECT … FOR UPDATE`) before inserting,
 * since `remaining_capacity` is computed, not stored. Cancellation
 * (P2-E01-S06) MUST clear the booking's `slot_id` (or this count must learn to
 * exclude cancelled bookings) so a released seat becomes bookable again — today
 * no cancellation path exists, so "bookings in slot" == "active bookings".
 */
async function bookingCountsBySlot(
  db: Executor,
  slotIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (slotIds.length === 0) return counts;
  const rows = await db
    .select({ slotId: bookings.slotId, n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(inArray(bookings.slotId, slotIds))
    .groupBy(bookings.slotId);
  for (const r of rows) {
    if (r.slotId) counts.set(r.slotId, Number(r.n));
  }
  return counts;
}

/** Decorate a slot row with its booked count + remaining capacity (clamped ≥ 0). */
function withRemaining(slot: SessionSlotRow, booked: number): SlotWithRemaining {
  return { ...slot, bookedCount: booked, remainingCapacity: Math.max(0, slot.capacity - booked) };
}

/**
 * List a service's concrete slots with computed `remainingCapacity` (AC3),
 * ordered by date then start time. `fromDate`/`toDate` (inclusive) bound the
 * window; omit them for all slots.
 */
export async function listSlotsWithRemaining(
  db: Executor,
  opts: { serviceId: string; fromDate?: string; toDate?: string },
): Promise<SlotWithRemaining[]> {
  const filters = [eq(sessionSlots.serviceId, opts.serviceId)];
  if (opts.fromDate !== undefined) filters.push(gte(sessionSlots.slotDate, opts.fromDate));
  if (opts.toDate !== undefined) filters.push(lte(sessionSlots.slotDate, opts.toDate));
  const slots = await db
    .select()
    .from(sessionSlots)
    .where(and(...filters))
    .orderBy(asc(sessionSlots.slotDate), asc(sessionSlots.startTime));
  const counts = await bookingCountsBySlot(
    db,
    slots.map((s) => s.id),
  );
  return slots.map((s) => withRemaining(s, counts.get(s.id) ?? 0));
}

/** Read one slot with its computed remaining capacity (AC3), or null. */
export async function getSlotWithRemaining(
  db: Executor,
  slotId: string,
): Promise<SlotWithRemaining | null> {
  const [slot] = await db.select().from(sessionSlots).where(eq(sessionSlots.id, slotId));
  if (!slot) return null;
  const counts = await bookingCountsBySlot(db, [slotId]);
  return withRemaining(slot, counts.get(slotId) ?? 0);
}

/* --- Parent browse read model (P2-E01-S02) ------------------------------- */

/** A slot decorated for the parent browse: remaining capacity + display state. */
export type BrowseSlot = SlotWithRemaining & {
  /** True when the slot is in the past or earlier today (greyed/disabled, AC3). */
  isPast: boolean;
  /** Bookable now: not past AND has remaining capacity. */
  available: boolean;
};

/**
 * Decide whether a slot is in the past relative to `today`/`nowMinutes` (AC3).
 * A slot on an earlier date is past; a slot today is past once its END time has
 * passed (`nowMinutes` = minutes since midnight). Future dates are never past.
 */
export function isSlotPast(
  slotDate: string,
  endTime: string,
  today: string,
  nowMinutes: number,
): boolean {
  if (slotDate < today) return true;
  if (slotDate > today) return false;
  return hmToMinutes(endTime) <= nowMinutes;
}

/**
 * Slots for the parent browse (P2-E01-S02 AC1/AC3): a service's concrete slots
 * over `[fromDate, fromDate + days)` with computed remaining capacity, each
 * tagged `isPast` (earlier date or already-ended today) and `available`
 * (not past AND remaining > 0). Ordered by date then start time. `today` and
 * `nowMinutes` anchor the "now" used for the past/earlier-today check.
 */
export async function browseServiceSlots(
  db: Executor,
  opts: { serviceId: string; fromDate: string; days?: number; today: string; nowMinutes: number },
): Promise<BrowseSlot[]> {
  const days = opts.days ?? 7;
  const toDate = addDaysIso(opts.fromDate, days - 1);
  const slots = await listSlotsWithRemaining(db, {
    serviceId: opts.serviceId,
    fromDate: opts.fromDate,
    toDate,
  });
  return slots.map((s) => {
    const isPast = isSlotPast(s.slotDate, s.endTime, opts.today, opts.nowMinutes);
    return { ...s, isPast, available: !isPast && s.remainingCapacity > 0 };
  });
}

/* --- Booking a slot (P2-E01-S03) ----------------------------------------- */

/** The slot id is unknown. */
export class SlotNotFoundError extends Error {
  constructor(public readonly slotId: string) {
    super(`Slot not found: ${slotId}`);
    this.name = "SlotNotFoundError";
  }
}

/** The slot is already at capacity — the seat was taken (AC4). */
export class SlotFullError extends Error {
  constructor(public readonly slotId: string) {
    super(`Slot is full: ${slotId}`);
    this.name = "SlotFullError";
  }
}

/** The service has no price effective at the slot date — it cannot be booked. */
export class ServicePriceMissingError extends Error {
  constructor(public readonly serviceId: string) {
    super(`No effective price for service: ${serviceId}`);
    this.name = "ServicePriceMissingError";
  }
}

/** This child already holds a booking in this slot — one seat per child per slot. */
export class DuplicateBookingError extends Error {
  constructor(
    public readonly slotId: string,
    public readonly childId: string,
  ) {
    super(`Child ${childId} is already booked in slot ${slotId}`);
    this.name = "DuplicateBookingError";
  }
}

/** The booking id is unknown, or the booking is not slot-based (reschedulable). */
export class BookingNotFoundError extends Error {
  constructor(public readonly bookingId: string) {
    super(`Booking not found or not reschedulable: ${bookingId}`);
    this.name = "BookingNotFoundError";
  }
}

/** The target slot belongs to a different service than the booking. */
export class ServiceMismatchError extends Error {
  constructor() {
    super("The new slot is for a different service");
    this.name = "ServiceMismatchError";
  }
}

export interface BookSlotInput {
  slotId: string;
  parentId: string;
  childId: string;
  /** Attributed staff member id (P2-E01-S04) — null for an unattributed self-book. */
  staffId?: string | null;
  /** Staff display-name snapshot at booking time (history-stable). Defaults to "". */
  staffNameSnapshot?: string;
  /** Acting user id for the audit row (null = system). */
  actor?: string | null;
  /** Request IP for the audit payload. */
  ip?: string | null;
}

export interface BookSlotResult {
  bookingId: string;
  invoiceId: string;
  serviceId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  /** The service price snapshotted onto the invoice + booking (AC3). */
  amountCents: number;
}

/**
 * Book a slot for a child (P2-E01-S03). Runs in a transaction that LOCKS the
 * slot row (`SELECT … FOR UPDATE`) before counting current bookings, so two
 * parents racing for the last seat are serialized: the first commits its
 * booking, the second re-reads the now-full count and is rejected with
 * {@link SlotFullError} (AC4). On success it snapshots the service's effective
 * price (AC3) into a new pending invoice and the booking row, and increments the
 * slot's occupancy by the booking insert itself (AC2 — capacity is computed from
 * `bookings.slot_id`, never a stored counter).
 *
 * Throws {@link SlotNotFoundError} / {@link SlotFullError} /
 * {@link ServicePriceMissingError} / {@link DuplicateBookingError}. Eligibility
 * (age) + ownership are enforced by the caller, which has the child + service
 * context.
 *
 * Concurrency note: correctness relies on READ COMMITTED (Postgres' default) —
 * once the second booker acquires the slot's `FOR UPDATE` lock, its capacity +
 * duplicate counts run on a fresh snapshot that sees the first booker's
 * committed rows. The booking insert + audit + invoice all commit together, so a
 * failed audit never leaves an un-audited booking (the outbox pattern).
 */
export async function bookSlot(db: Database, input: BookSlotInput): Promise<BookSlotResult> {
  return db.transaction(async (tx) => {
    const [slot] = await tx
      .select()
      .from(sessionSlots)
      .where(eq(sessionSlots.id, input.slotId))
      .for("update");
    if (!slot) throw new SlotNotFoundError(input.slotId);

    // One seat per child per slot — checked under the slot lock so concurrent
    // duplicate attempts serialize (AC: a child can't take two seats in a slot).
    const [existing] = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.slotId, slot.id), eq(bookings.childId, input.childId)));
    if (existing) throw new DuplicateBookingError(slot.id, input.childId);

    const counts = await bookingCountsBySlot(tx, [slot.id]);
    if ((counts.get(slot.id) ?? 0) >= slot.capacity) throw new SlotFullError(slot.id);

    const price = await resolveServicePriceAt(tx, slot.serviceId, slot.slotDate);
    if (!price) throw new ServicePriceMissingError(slot.serviceId);
    const amountCents = price.amountCents;

    const [invoice] = await tx
      .insert(invoices)
      .values({ parentId: input.parentId, amountDue: amountCents, serviceId: slot.serviceId, status: "pending" })
      .returning();
    const [booking] = await tx
      .insert(bookings)
      .values({
        parentId: input.parentId,
        childId: input.childId,
        serviceId: slot.serviceId,
        slotId: slot.id,
        invoiceId: invoice!.id,
        // Staff attribution (P2-E01-S04) — null + "" for an unattributed self-book.
        // The rate snapshot is the service price at booking time.
        staffId: input.staffId ?? null,
        staffNameSnapshot: input.staffNameSnapshot ?? "",
        staffRateSnapshot: amountCents,
      })
      .returning();

    // Audit inside the transaction (atomic with the booking — AC5 / outbox).
    await audit(tx, {
      actor: input.actor ?? null,
      action: "booking.created",
      target: { table: "bookings", id: booking!.id },
      payload: {
        slot_id: slot.id,
        child_id: input.childId,
        service_id: slot.serviceId,
        invoice_id: invoice!.id,
        amount_cents: amountCents,
        ip: input.ip ?? undefined,
      },
    });

    return {
      bookingId: booking!.id,
      invoiceId: invoice!.id,
      serviceId: slot.serviceId,
      slotDate: slot.slotDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
      amountCents,
    };
  });
}

/* --- Rescheduling a booking (P2-E01-S05) --------------------------------- */

/** A slot's start instant in epoch ms (UTC wall-clock, matching the codebase). */
export function slotStartUtcMs(slotDate: string, startTime: string): number {
  return Date.parse(`${slotDate}T${startTime}:00.000Z`);
}

/**
 * Whether a booking on `(slotDate, startTime)` may still be rescheduled at
 * `nowMs`: allowed up to `cutoffHours` before the slot start (AC1). After that
 * the online reschedule is refused (AC4).
 */
export function isWithinRescheduleCutoff(
  slotDate: string,
  startTime: string,
  cutoffHours: number,
  nowMs: number,
): boolean {
  return nowMs <= slotStartUtcMs(slotDate, startTime) - cutoffHours * 3_600_000;
}

export interface RescheduleResult {
  bookingId: string;
  oldSlotId: string;
  newSlotId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
}

/**
 * Move a booking to a new slot (P2-E01-S05 AC2/AC3). One transaction: lock the
 * target slot, verify it is the SAME service, has capacity, and the child isn't
 * already booked there, then repoint the booking's `slot_id` (the pending invoice
 * is untouched — the price is unchanged) and audit both slot ids. The cut-off
 * (AC1/AC4) is enforced by the caller, which has the old slot + service context.
 *
 * Throws {@link BookingNotFoundError} / {@link SlotNotFoundError} /
 * {@link ServiceMismatchError} / {@link SlotFullError} / {@link DuplicateBookingError}.
 */
export async function rescheduleBooking(
  db: Database,
  input: { bookingId: string; newSlotId: string; actor?: string | null; ip?: string | null },
): Promise<RescheduleResult> {
  return db.transaction(async (tx) => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId));
    if (!booking || !booking.slotId) throw new BookingNotFoundError(input.bookingId);

    const [newSlot] = await tx
      .select()
      .from(sessionSlots)
      .where(eq(sessionSlots.id, input.newSlotId))
      .for("update");
    if (!newSlot) throw new SlotNotFoundError(input.newSlotId);
    if (newSlot.serviceId !== booking.serviceId) throw new ServiceMismatchError();

    const counts = await bookingCountsBySlot(tx, [newSlot.id]);
    if ((counts.get(newSlot.id) ?? 0) >= newSlot.capacity) throw new SlotFullError(newSlot.id);

    const [dup] = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.slotId, newSlot.id), eq(bookings.childId, booking.childId)));
    if (dup) throw new DuplicateBookingError(newSlot.id, booking.childId);

    const oldSlotId = booking.slotId;
    await tx
      .update(bookings)
      .set({ slotId: newSlot.id, updatedAt: new Date() })
      .where(eq(bookings.id, input.bookingId));

    await audit(tx, {
      actor: input.actor ?? null,
      action: "booking.rescheduled",
      target: { table: "bookings", id: input.bookingId },
      payload: {
        old_slot_id: oldSlotId,
        new_slot_id: newSlot.id,
        child_id: booking.childId,
        service_id: booking.serviceId,
        ip: input.ip ?? undefined,
      },
    });

    return {
      bookingId: input.bookingId,
      oldSlotId,
      newSlotId: newSlot.id,
      slotDate: newSlot.slotDate,
      startTime: newSlot.startTime,
      endTime: newSlot.endTime,
    };
  });
}
