import { and, asc, eq, gte, inArray, isNotNull, lte, ne, notInArray } from "drizzle-orm";
import {
  attendances,
  audit,
  bookings,
  children,
  invoices,
  salonSlots,
  services,
  staff,
  staffAvailability,
  type Database,
  type SalonSlotRow,
  type StaffAvailabilityRow,
} from "@bm/db";
import { addDaysIso, dayOfWeekIso, slotWindows } from "./schedules.js";
import { resolveServicePriceAt, type Executor } from "./services.js";
import type { SalonReportingRow } from "./salon-reporting.js";

/**
 * P3-E03-S01 (Story 25.1) — Kids-Only Salon Flow: stylist availability + salon
 * slot creation. Re-uses the P2-E01 slot mechanics (window/date math from
 * `schedules.ts`), scoped to the salon unit.
 *
 * Two layers, mirroring the booking engine:
 *  - `staff_availability` is the recurring weekly TEMPLATE for a stylist
 *    ("on `dayOfWeek`, between `startTime`/`endTime`, during the calendar range
 *    `[effectiveFrom, effectiveTo]`").
 *  - `salon_slots` is the concrete, bookable MATERIALISATION — one row per
 *    (availability × salon service × date × window) for a rolling future horizon,
 *    regenerated nightly by the cron in `apps/jobs`.
 *
 * The generator is FUTURE-ONLY and idempotent: it never mutates or deletes a slot
 * that is in the past or already booked, so editing availability changes only
 * future, not-yet-booked slots (AC3).
 */

/** How many days ahead an availability is materialised into concrete slots (AC2). */
export const SALON_SLOT_HORIZON_DAYS = 60;

/**
 * Max rows per `INSERT … VALUES` batch — same ceiling-guard as the P2-E01 slot
 * generator (each row binds ~7 parameters, well under Postgres' 65535 limit).
 */
const SALON_SLOT_INSERT_CHUNK = 500;

/* --- effective_date_range helper (AC1) ----------------------------------- */

/**
 * Whether an availability's effective date range covers `dateIso`. The range is
 * INCLUSIVE on both ends; a null `effectiveTo` means open/ongoing. Comparison is
 * on the zero-padded `YYYY-MM-DD` string, which orders the same as the calendar.
 */
export function availabilityCoversDate(
  effectiveFrom: string,
  effectiveTo: string | null,
  dateIso: string,
): boolean {
  if (dateIso < effectiveFrom) return false;
  if (effectiveTo !== null && dateIso > effectiveTo) return false;
  return true;
}

/* --- staff_availability CRUD (AC1) --------------------------------------- */

export interface CreateStaffAvailabilityInput {
  staffId: string;
  /** 0 = Sunday .. 6 = Saturday. */
  dayOfWeek: number;
  /** Window start, `HH:MM` 24h. */
  startTime: string;
  /** Window end, `HH:MM` 24h (after `startTime`). */
  endTime: string;
  /** Calendar date the weekly rule starts applying (inclusive, `YYYY-MM-DD`). */
  effectiveFrom: string;
  /** Calendar date the rule stops applying (INCLUSIVE); omit/null = open/ongoing. */
  effectiveTo?: string | null;
  /** Defaults to active. */
  isActive?: boolean;
}

/** Declare a stylist's recurring weekly availability (AC1). Active by default. */
export async function createStaffAvailability(db: Executor, input: CreateStaffAvailabilityInput) {
  const [row] = await db
    .insert(staffAvailability)
    .values({
      staffId: input.staffId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      isActive: input.isActive ?? true,
    })
    .returning();
  return row!;
}

export interface UpdateStaffAvailabilityInput {
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  effectiveFrom?: string;
  /** Null clears the upper bound (re-opens the range). */
  effectiveTo?: string | null;
  /** Soft-retire via `isActive = false` — availabilities are never hard-deleted. */
  isActive?: boolean;
}

/**
 * Update an availability (AC1). Partial patch. Edits change only FUTURE generated
 * slots — already-materialised `salon_slots` keep their snapshot and are never
 * rewritten by {@link generateSalonSlotsForAvailability}. Call
 * {@link resyncStaffAvailabilitySlots} after an edit to prune stale future slots
 * and re-materialise the current rule. Returns the updated row or null.
 */
export async function updateStaffAvailability(
  db: Executor,
  id: string,
  patch: UpdateStaffAvailabilityInput,
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.dayOfWeek !== undefined) set.dayOfWeek = patch.dayOfWeek;
  if (patch.startTime !== undefined) set.startTime = patch.startTime;
  if (patch.endTime !== undefined) set.endTime = patch.endTime;
  if (patch.effectiveFrom !== undefined) set.effectiveFrom = patch.effectiveFrom;
  if (patch.effectiveTo !== undefined) set.effectiveTo = patch.effectiveTo;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  const [row] = await db
    .update(staffAvailability)
    .set(set)
    .where(eq(staffAvailability.id, id))
    .returning();
  return row ?? null;
}

/** Read one availability by id, or null. */
export async function getStaffAvailability(db: Executor, id: string) {
  const [row] = await db.select().from(staffAvailability).where(eq(staffAvailability.id, id));
  return row ?? null;
}

/**
 * List availabilities for a stylist (or all), by weekday then start time.
 * `activeOnly` filters retired rules.
 */
export async function listStaffAvailability(
  db: Executor,
  opts: { staffId?: string; activeOnly?: boolean } = {},
) {
  const filters = [];
  if (opts.staffId !== undefined) filters.push(eq(staffAvailability.staffId, opts.staffId));
  if (opts.activeOnly) filters.push(eq(staffAvailability.isActive, true));
  const where =
    filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);
  return db
    .select()
    .from(staffAvailability)
    .where(where)
    .orderBy(asc(staffAvailability.dayOfWeek), asc(staffAvailability.startTime));
}

/* --- Salon service durations (AC2 input) --------------------------------- */

/** A salon service the generator materialises slots for: id + its slot duration. */
export interface SalonServiceDuration {
  id: string;
  /** Appointment length in minutes (> 0). */
  salonDurationMinutes: number;
}

/**
 * Load the ACTIVE salon services that carry a positive duration — the catalogue
 * the nightly generator crosses with every active availability (AC2). A salon
 * service with no duration set (null) is not yet bookable as discrete slots and
 * is skipped.
 */
export async function listSalonServiceDurations(db: Executor): Promise<SalonServiceDuration[]> {
  const rows = await db
    .select({
      id: services.id,
      salonDurationMinutes: services.salonDurationMinutes,
      isActive: services.isActive,
      unit: services.unit,
    })
    .from(services)
    .where(eq(services.unit, "salon"));
  return rows
    .filter(
      (r): r is typeof r & { salonDurationMinutes: number } =>
        r.isActive && r.salonDurationMinutes !== null && r.salonDurationMinutes > 0,
    )
    .map((r) => ({ id: r.id, salonDurationMinutes: r.salonDurationMinutes }));
}

/* --- Salon slot materialisation (AC2 / AC3) ------------------------------ */

/** The calendar dates a salon slot is generated for: the date sits in the
 * `[fromDate, fromDate + days)` horizon, matches the availability's weekday, AND
 * falls within its effective date range (AC1). */
function salonSlotDates(availability: StaffAvailabilityRow, fromDate: string, days: number): string[] {
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

export interface GenerateSalonSlotsOpts {
  /** First date of the generation horizon (`YYYY-MM-DD`). Slots are future-only. */
  fromDate: string;
  /** Horizon length in days. Defaults to {@link SALON_SLOT_HORIZON_DAYS}. */
  days?: number;
  /** The salon services to materialise slots for (id + duration). */
  services: SalonServiceDuration[];
}

/**
 * Materialise an availability into concrete `salon_slots` over `[fromDate,
 * fromDate + days)` — one slot-set per salon service, the availability window
 * chopped into back-to-back slots of each service's duration (AC2). A partial
 * trailing window that would overrun `endTime` is dropped (reuses
 * {@link slotWindows}).
 *
 * Idempotent: the `(availability_id, service_id, slot_date, start_time)` unique
 * index means re-running NEVER duplicates and NEVER rewrites an existing slot — so
 * a generated/booked slot keeps its duration snapshot (AC3). Inactive
 * availabilities generate nothing. Returns the number of NEW slots inserted.
 */
export async function generateSalonSlotsForAvailability(
  db: Executor,
  availability: StaffAvailabilityRow,
  opts: GenerateSalonSlotsOpts,
): Promise<number> {
  if (!availability.isActive) return 0;
  if (opts.services.length === 0) return 0;
  const days = opts.days ?? SALON_SLOT_HORIZON_DAYS;
  const dates = salonSlotDates(availability, opts.fromDate, days);
  if (dates.length === 0) return 0;

  const values: {
    staffId: string;
    serviceId: string;
    availabilityId: string;
    slotDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
  }[] = [];
  for (const service of opts.services) {
    const windows = slotWindows(
      availability.startTime,
      availability.endTime,
      service.salonDurationMinutes,
    );
    if (windows.length === 0) continue;
    for (const slotDate of dates) {
      for (const w of windows) {
        values.push({
          staffId: availability.staffId,
          serviceId: service.id,
          availabilityId: availability.id,
          slotDate,
          startTime: w.startTime,
          endTime: w.endTime,
          // Duration SNAPSHOT taken at generation time (AC3).
          durationMinutes: service.salonDurationMinutes,
        });
      }
    }
  }
  if (values.length === 0) return 0;

  let insertedCount = 0;
  for (let i = 0; i < values.length; i += SALON_SLOT_INSERT_CHUNK) {
    const inserted = await db
      .insert(salonSlots)
      .values(values.slice(i, i + SALON_SLOT_INSERT_CHUNK))
      .onConflictDoNothing({
        target: [
          salonSlots.availabilityId,
          salonSlots.serviceId,
          salonSlots.slotDate,
          salonSlots.startTime,
        ],
      })
      .returning({ id: salonSlots.id });
    insertedCount += inserted.length;
  }
  return insertedCount;
}

/**
 * Withdraw an availability's FUTURE slots (`slotDate >= fromDate`) that NO booking
 * consumes, leaving booked slots — and ALL past slots — untouched (AC3). Used when
 * an availability's window/day/range changes or it is retired, so stale future
 * availability is removed while history + booked slots survive. Returns the number
 * of slots deleted.
 */
export async function deleteFutureUnbookedSalonSlots(
  db: Executor,
  availabilityId: string,
  fromDate: string,
): Promise<number> {
  // Salon slot ids a LIVE booking still references — these must never be deleted.
  // Exclude cancelled bookings (mirror the browse-availability subquery): otherwise
  // a cancelled-booking slot is wrongly protected from resync and keeps being offered
  // to parents even after the stylist's availability no longer covers it.
  const bookedSalonSlotIds = db
    .select({ id: bookings.salonSlotId })
    .from(bookings)
    .where(and(isNotNull(bookings.salonSlotId), ne(bookings.status, "cancelled")));
  const deleted = await db
    .delete(salonSlots)
    .where(
      and(
        eq(salonSlots.availabilityId, availabilityId),
        gte(salonSlots.slotDate, fromDate),
        notInArray(salonSlots.id, bookedSalonSlotIds),
      ),
    )
    .returning({ id: salonSlots.id });
  return deleted.length;
}

/**
 * Reconcile an availability's concrete slots after an edit (AC3): first withdraw
 * the future UNBOOKED slots that no longer match the rule (or all of them, when
 * the availability is retired), then re-materialise the current rule. Booked +
 * past slots keep their snapshot. Idempotent. Returns the number of slots
 * (re)generated.
 *
 * The mutation-path counterpart to {@link regenerateSalonSlots} (the nightly cron
 * stays purely additive — it never prunes).
 */
export async function resyncStaffAvailabilitySlots(
  db: Executor,
  availability: StaffAvailabilityRow,
  opts: GenerateSalonSlotsOpts,
): Promise<number> {
  await deleteFutureUnbookedSalonSlots(db, availability.id, opts.fromDate);
  return generateSalonSlotsForAvailability(db, availability, opts);
}

/**
 * Regenerate concrete salon slots for EVERY active availability × every active
 * salon service over the horizon (the nightly cron's unit of work, AC2). Purely
 * additive — it never prunes, so past/booked slots are never disturbed (AC3).
 * Returns the total number of new slots inserted across all availabilities.
 */
export async function regenerateSalonSlots(
  db: Executor,
  opts: { fromDate: string; days?: number },
): Promise<number> {
  const [availabilities, salonServices] = await Promise.all([
    listStaffAvailability(db, { activeOnly: true }),
    listSalonServiceDurations(db),
  ]);
  if (salonServices.length === 0) return 0;
  let total = 0;
  for (const availability of availabilities) {
    total += await generateSalonSlotsForAvailability(db, availability, {
      fromDate: opts.fromDate,
      days: opts.days,
      services: salonServices,
    });
  }
  return total;
}

/* --- Salon slot read model ----------------------------------------------- */

/**
 * List concrete salon slots, ordered by date then start time. Filter by
 * `staffId`, `serviceId`, and/or a `[fromDate, toDate]` (inclusive) window.
 */
export async function listSalonSlots(
  db: Executor,
  opts: { staffId?: string; serviceId?: string; fromDate?: string; toDate?: string } = {},
): Promise<SalonSlotRow[]> {
  const filters = [];
  if (opts.staffId !== undefined) filters.push(eq(salonSlots.staffId, opts.staffId));
  if (opts.serviceId !== undefined) filters.push(eq(salonSlots.serviceId, opts.serviceId));
  if (opts.fromDate !== undefined) filters.push(gte(salonSlots.slotDate, opts.fromDate));
  if (opts.toDate !== undefined) filters.push(lte(salonSlots.slotDate, opts.toDate));
  const where =
    filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);
  return db
    .select()
    .from(salonSlots)
    .where(where)
    .orderBy(asc(salonSlots.slotDate), asc(salonSlots.startTime));
}

/* --- Parent salon booking (P3-E03-S02 / Story 25.2) ---------------------- */

/**
 * The salon slot ids a non-cancelled booking already consumes. A salon slot
 * holds ONE seat, so a slot referenced by a live booking is no longer offered
 * (mirrors the P2-E01 `bookings.slot_id` capacity model, but capacity = 1). A
 * cancelled booking frees its slot. Used as a `NOT IN` sub-select in the
 * availability query (AC1/AC2) so the read is index-backed and race-free for the
 * browse path; the confirm path re-checks under a lock.
 */
function bookedSalonSlotIdsSubquery(db: Executor) {
  return db
    .select({ id: bookings.salonSlotId })
    .from(bookings)
    .where(and(isNotNull(bookings.salonSlotId), ne(bookings.status, "cancelled")));
}

/**
 * List the AVAILABLE salon slots for a service over a date window (AC1): future
 * slots for `serviceId` that NO live booking consumes, ordered by date then start
 * time. When `staffId` is supplied, only that stylist's slots are returned (AC2);
 * otherwise every stylist's open slots are returned (the "Any available" browse,
 * AC1/AC3). `fromDate`/`toDate` are inclusive `YYYY-MM-DD` bounds; pass `fromDate
 * = today` to hide past dates.
 */
export async function listAvailableSalonSlots(
  db: Executor,
  opts: { serviceId: string; staffId?: string; fromDate?: string; toDate?: string },
): Promise<SalonSlotRow[]> {
  const filters = [
    eq(salonSlots.serviceId, opts.serviceId),
    notInArray(salonSlots.id, bookedSalonSlotIdsSubquery(db)),
  ];
  if (opts.staffId !== undefined) filters.push(eq(salonSlots.staffId, opts.staffId));
  if (opts.fromDate !== undefined) filters.push(gte(salonSlots.slotDate, opts.fromDate));
  if (opts.toDate !== undefined) filters.push(lte(salonSlots.slotDate, opts.toDate));
  return db
    .select()
    .from(salonSlots)
    .where(and(...filters))
    .orderBy(asc(salonSlots.slotDate), asc(salonSlots.startTime));
}

/** No stylist has an available slot for the service on the requested date (AC3). */
export class NoStylistAvailableError extends Error {
  constructor(
    public readonly serviceId: string,
    public readonly date: string,
  ) {
    super(`No stylist available for service ${serviceId} on ${date}`);
    this.name = "NoStylistAvailableError";
  }
}

/**
 * Resolve the LEAST-BUSY stylist for an "Any available" salon booking (AC3).
 *
 * Rule: among the ACTIVE stylists who have at least one still-available slot for
 * `serviceId` on `date`, pick the one with the FEWEST non-cancelled salon
 * bookings already on that date (a confirmed booking makes a stylist busier). The
 * count is the stylist's salon bookings whose slot falls on `date` — a deterministic,
 * load-balancing measure of how full their day is.
 *
 * Tie-break (deterministic): when two candidates have the same booking count, the
 * stylist with the lexicographically-SMALLEST `staffId` (UUID ascending) wins. So
 * the resolution is stable across runs and independent of row-insertion order.
 *
 * Throws {@link NoStylistAvailableError} when no active stylist has an open slot
 * on that date. Inactive (retired) stylists are never offered.
 */
export async function resolveLeastBusyStylist(
  db: Executor,
  opts: { serviceId: string; date: string },
): Promise<string> {
  // Candidate stylists: those with an open slot for this service on this date.
  const available = await listAvailableSalonSlots(db, {
    serviceId: opts.serviceId,
    fromDate: opts.date,
    toDate: opts.date,
  });
  const candidateIds = [...new Set(available.map((s) => s.staffId))];
  if (candidateIds.length === 0) throw new NoStylistAvailableError(opts.serviceId, opts.date);

  // Keep only ACTIVE stylists (never load-balance onto a retired member).
  const activeRows = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(inArray(staff.id, candidateIds), eq(staff.active, true)));
  const activeIds = new Set(activeRows.map((r) => r.id));
  const eligible = candidateIds.filter((id) => activeIds.has(id));
  if (eligible.length === 0) throw new NoStylistAvailableError(opts.serviceId, opts.date);

  // Existing non-cancelled salon bookings on this date, grouped by stylist — the
  // "busyness" measure. A stylist with no bookings yet counts as 0.
  const dayBookings = await db
    .select({ staffId: bookings.staffId })
    .from(bookings)
    .innerJoin(salonSlots, eq(bookings.salonSlotId, salonSlots.id))
    .where(and(eq(salonSlots.slotDate, opts.date), ne(bookings.status, "cancelled")));
  const counts = new Map<string, number>();
  for (const b of dayBookings) {
    if (b.staffId === null) continue;
    counts.set(b.staffId, (counts.get(b.staffId) ?? 0) + 1);
  }

  // Fewest bookings wins; tie-break on smallest staffId for determinism.
  return eligible
    .slice()
    .sort((a, b) => {
      const ca = counts.get(a) ?? 0;
      const cb = counts.get(b) ?? 0;
      if (ca !== cb) return ca - cb;
      return a < b ? -1 : a > b ? 1 : 0;
    })[0]!;
}

/** The salon slot id is unknown. */
export class SalonSlotNotFoundError extends Error {
  constructor(public readonly salonSlotId: string) {
    super(`Salon slot not found: ${salonSlotId}`);
    this.name = "SalonSlotNotFoundError";
  }
}

/** The salon slot is already taken — its single seat is gone (AC4 race guard). */
export class SalonSlotTakenError extends Error {
  constructor(public readonly salonSlotId: string) {
    super(`Salon slot already booked: ${salonSlotId}`);
    this.name = "SalonSlotTakenError";
  }
}

/** The salon service has no price effective at the slot date — it cannot be booked. */
export class SalonServicePriceMissingError extends Error {
  constructor(public readonly serviceId: string) {
    super(`No effective price for salon service: ${serviceId}`);
    this.name = "SalonServicePriceMissingError";
  }
}

/** The chosen stylist does not match the slot's stylist (or is unknown/retired). */
export class SalonStylistMismatchError extends Error {
  constructor() {
    super("The chosen stylist is not available for this slot");
    this.name = "SalonStylistMismatchError";
  }
}

export interface BookSalonSlotInput {
  salonSlotId: string;
  parentId: string;
  childId: string;
  /**
   * The stylist the parent chose. When omitted/null the slot's own stylist is
   * attributed (the slot was already resolved to a least-busy stylist's slot by
   * the caller — AC3). When supplied it MUST equal the slot's stylist (AC2).
   */
  staffId?: string | null;
  /** Acting user id for the audit row (the parent). */
  actor?: string | null;
  /** Request IP for the audit payload. */
  ip?: string | null;
}

export interface BookSalonSlotResult {
  bookingId: string;
  invoiceId: string;
  serviceId: string;
  salonSlotId: string;
  /** The stylist the booking was attributed to (resolved — AC3/AC4). */
  staffId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  /** Service price snapshotted onto the pending invoice (AC4), integer KES cents. */
  amountCents: number;
}

/**
 * Book a salon slot for a child (P3-E03-S02 / Story 25.2 AC4). Runs in a
 * transaction that LOCKS the salon slot row (`SELECT … FOR UPDATE`) before
 * checking that no live booking consumes it, so two parents racing for the one
 * seat serialize: the first commits, the second is rejected with
 * {@link SalonSlotTakenError}. On success it ATTRIBUTES the slot's stylist (the
 * resolved least-busy stylist when the parent picked "Any available"), snapshots
 * the service's effective price into a new PENDING invoice + the booking's
 * `staffRateSnapshot`, records the booking against `bookings.salonSlotId`, and
 * audits `booking.created` — all atomically (reusing the P2-E01 invoice +
 * attribution + audit write semantics).
 *
 * Throws {@link SalonSlotNotFoundError} / {@link SalonSlotTakenError} /
 * {@link SalonServicePriceMissingError} / {@link SalonStylistMismatchError}.
 */
export async function bookSalonSlot(
  db: Database,
  input: BookSalonSlotInput,
): Promise<BookSalonSlotResult> {
  return db.transaction(async (tx) => {
    const [slot] = await tx
      .select()
      .from(salonSlots)
      .where(eq(salonSlots.id, input.salonSlotId))
      .for("update");
    if (!slot) throw new SalonSlotNotFoundError(input.salonSlotId);

    // A specific stylist pick must match the slot's stylist (AC2). When "Any
    // available", the caller already resolved a least-busy stylist's slot (AC3),
    // so we attribute the slot's own stylist.
    if (input.staffId != null && input.staffId !== slot.staffId) {
      throw new SalonStylistMismatchError();
    }

    // One seat per salon slot — checked under the slot lock so concurrent
    // attempts serialize (AC4). A cancelled prior booking frees the seat.
    const [existing] = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.salonSlotId, slot.id), ne(bookings.status, "cancelled")));
    if (existing) throw new SalonSlotTakenError(slot.id);

    // The attributed stylist's display-name snapshot (history-stable, AC4).
    const [stylist] = await tx.select().from(staff).where(eq(staff.id, slot.staffId));
    if (!stylist || !stylist.active) throw new SalonStylistMismatchError();

    const price = await resolveServicePriceAt(tx, slot.serviceId, slot.slotDate);
    if (!price) throw new SalonServicePriceMissingError(slot.serviceId);
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
        salonSlotId: slot.id,
        invoiceId: invoice!.id,
        // Attribution: the resolved stylist (AC4) — drives the commission ledger.
        staffId: slot.staffId,
        staffNameSnapshot: stylist.displayName,
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
        salon_slot_id: slot.id,
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
      salonSlotId: slot.id,
      staffId: slot.staffId,
      slotDate: slot.slotDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
      amountCents,
    };
  });
}

/* --- Salon counter board (P3-E03-S03 / Story 25.3 AC1) ------------------- */

/**
 * One salon booking on the reception counter board (AC1). The booking joins its
 * salon slot (stylist + hour), the child (name + photo-consent flag), and its
 * attendance row (check-in / completion lifecycle) so the board can group by
 * stylist then hour and gate the photo capture on consent (AC3).
 */
export interface SalonCounterBookingRow {
  bookingId: string;
  salonSlotId: string;
  staffId: string;
  staffName: string;
  childId: string;
  childName: string;
  /** Per-child photo consent (P1-E02-S04) — gates the completion photo (AC3). */
  photoConsent: boolean;
  serviceId: string | null;
  serviceName: string | null;
  slotDate: string;
  startTime: string;
  endTime: string;
  /** How the booking pays — `wallet` triggers a check-in debit, `subscription` pre-covered. */
  paidVia: "wallet" | "subscription";
  /** Set once the child has been checked in (AC2), else null. */
  checkedInAt: string | null;
  /** Set once the salon service has been marked complete (AC3), else null. */
  completedAt: string | null;
  /** The completion photo reference, when one was captured under consent (AC3). */
  photoRef: string | null;
}

/**
 * Today's (or a given date's) salon bookings for the counter board (AC1). Returns
 * every non-cancelled salon booking (`bookings.salonSlotId` set) whose slot falls
 * on `date`, joined to the stylist, child, and attendance lifecycle — ordered by
 * stylist name, then hour (start time). The caller groups by stylist/hour (a pure
 * `@bm/contracts` helper).
 */
export async function listSalonBookingsForDate(
  db: Executor,
  opts: { date: string },
): Promise<SalonCounterBookingRow[]> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      salonSlotId: salonSlots.id,
      staffId: salonSlots.staffId,
      staffName: staff.displayName,
      childId: children.id,
      childFirstName: children.firstName,
      childLastName: children.lastName,
      photoConsent: children.photoConsent,
      serviceId: salonSlots.serviceId,
      serviceName: services.name,
      slotDate: salonSlots.slotDate,
      startTime: salonSlots.startTime,
      endTime: salonSlots.endTime,
      paidVia: bookings.paidVia,
      checkedInAt: attendances.checkedInAt,
      completedAt: attendances.completedAt,
      photoRef: attendances.photoRef,
    })
    .from(bookings)
    .innerJoin(salonSlots, eq(bookings.salonSlotId, salonSlots.id))
    .innerJoin(staff, eq(salonSlots.staffId, staff.id))
    .innerJoin(children, eq(bookings.childId, children.id))
    .leftJoin(services, eq(salonSlots.serviceId, services.id))
    .leftJoin(attendances, eq(attendances.bookingId, bookings.id))
    .where(and(eq(salonSlots.slotDate, opts.date), ne(bookings.status, "cancelled")))
    .orderBy(asc(staff.displayName), asc(salonSlots.startTime));

  return rows.map((r) => ({
    bookingId: r.bookingId,
    salonSlotId: r.salonSlotId,
    staffId: r.staffId,
    staffName: r.staffName,
    childId: r.childId,
    childName: `${r.childFirstName}${r.childLastName ? ` ${r.childLastName}` : ""}`,
    photoConsent: r.photoConsent,
    serviceId: r.serviceId,
    serviceName: r.serviceName,
    slotDate: r.slotDate,
    startTime: r.startTime,
    endTime: r.endTime,
    paidVia: r.paidVia === "subscription" ? "subscription" : "wallet",
    checkedInAt: r.checkedInAt ? r.checkedInAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    photoRef: r.photoRef ?? null,
  }));
}

/* --- Salon-specific reporting read model (P3-E03-S05 / Story 25.5) -------- */

/**
 * The day's salon bookings projected for reporting (Story 25.5). Every
 * non-cancelled salon booking (`bookings.salonSlotId` set) whose slot falls on
 * `date`, joined to the stylist (attribution snapshot fallback) and its
 * attendance lifecycle. REVENUE is the booking's `staffRateSnapshot` — the
 * service price written onto the booking + its invoice at book time (the same
 * source `bookSalonSlot` uses) — so reporting revenue is consistent with how the
 * booking was invoiced, settled or pending.
 *
 * The pure {@link aggregateSalonDayReport} reducer turns these rows into the tile
 * totals (bookings / no-shows / revenue) and the per-stylist drill-down; the DB
 * read stays a thin projection so the aggregation is exhaustively unit-tested.
 */
export async function listSalonReportingRowsForDate(
  db: Executor,
  opts: { date: string },
): Promise<SalonReportingRow[]> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      staffId: salonSlots.staffId,
      staffName: staff.displayName,
      staffNameSnapshot: bookings.staffNameSnapshot,
      revenueCents: bookings.staffRateSnapshot,
      slotDate: salonSlots.slotDate,
      startTime: salonSlots.startTime,
      endTime: salonSlots.endTime,
      checkedInAt: attendances.checkedInAt,
      completedAt: attendances.completedAt,
    })
    .from(bookings)
    .innerJoin(salonSlots, eq(bookings.salonSlotId, salonSlots.id))
    .innerJoin(staff, eq(salonSlots.staffId, staff.id))
    .leftJoin(attendances, eq(attendances.bookingId, bookings.id))
    .where(and(eq(salonSlots.slotDate, opts.date), ne(bookings.status, "cancelled")))
    .orderBy(asc(staff.displayName), asc(salonSlots.startTime));

  return rows.map((r) => ({
    bookingId: r.bookingId,
    staffId: r.staffId,
    // Prefer the live display name; fall back to the booking snapshot.
    staffName: r.staffName ?? r.staffNameSnapshot,
    revenueCents: r.revenueCents,
    slotDate: r.slotDate,
    startTime: r.startTime,
    endTime: r.endTime,
    checkedInAt: r.checkedInAt ? r.checkedInAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));
}

/* --- Ad-hoc walk-in salon slot (P3-E03-S03 / Story 25.3 AC4) ------------- */

export interface CreateAdHocSalonSlotInput {
  staffId: string;
  serviceId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  /** Slot duration snapshot (minutes). Defaults from the start/end span. */
  durationMinutes?: number;
}

/** `HH:MM` → minutes-since-midnight. */
function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Create a one-off salon slot for a walk-in "book now" (AC4). The slot has NO
 * generating availability rule (`availabilityId = null` — the migration already
 * allows it) and carries its own duration snapshot, so it never collides with the
 * nightly generator's `(availability_id, service_id, date, start_time)` unique
 * index and is fully bookable via {@link bookSalonSlot}. Returns the new slot.
 */
export async function createAdHocSalonSlot(
  db: Executor,
  input: CreateAdHocSalonSlotInput,
): Promise<SalonSlotRow> {
  const durationMinutes =
    input.durationMinutes ?? Math.max(1, minutesOf(input.endTime) - minutesOf(input.startTime));
  const [row] = await db
    .insert(salonSlots)
    .values({
      staffId: input.staffId,
      serviceId: input.serviceId,
      availabilityId: null,
      slotDate: input.slotDate,
      startTime: input.startTime,
      endTime: input.endTime,
      durationMinutes,
    })
    .returning();
  return row!;
}

/* --- Reassign a salon booking between stylists (P3-E03-S04 / Story 25.4) - */

/** The target stylist is unknown, retired, or has no open slot for the booking's
 * service on its date — the booking cannot be moved to them (AC2). */
export class SalonStylistUnavailableError extends Error {
  constructor(public readonly staffId: string) {
    super(`Stylist ${staffId} has no available slot for this service/date`);
    this.name = "SalonStylistUnavailableError";
  }
}

export interface ReassignSalonBookingInput {
  bookingId: string;
  /** The stylist to move the booking to. */
  toStaffId: string;
  /** Acting staff user id (the audit actor). */
  actor?: string | null;
  ip?: string | null;
}

export interface ReassignSalonBookingResult {
  bookingId: string;
  /** The stylist the booking was attributed to before the move. */
  fromStaffId: string;
  /** The stylist the booking is attributed to after the move. */
  toStaffId: string;
  /** The salon slot the booking now occupies. */
  newSalonSlotId: string;
  /** The salon slot the booking previously occupied (now freed), or null. */
  oldSalonSlotId: string | null;
  /** True when the target stylist already owned the booking — a pure no-op. */
  unchanged: boolean;
  /**
   * True when a settled commission accrual was moved to the new stylist (AC4).
   * The actual ledger move is performed by the caller (`@bm/wallet`); this flag
   * reports whether the booking was already settled at reassign time. Always
   * false on an `unchanged` no-op.
   */
  commissionMoved: boolean;
}

/**
 * Reassign a salon booking to a different stylist on the day (Story 25.4). Runs
 * in a transaction that LOCKS the booking, picks an open slot for the target
 * stylist (same service + date), then re-checks that slot is still free under a
 * `SELECT … FOR UPDATE` lock — so a concurrent booking/reassign for the target's
 * seat serialises (AC2, reusing the 25-2 lock-then-check pattern). On success it
 * repoints `bookings.salonSlotId` at the target's slot and updates the
 * ATTRIBUTION snapshot (`staffId` + `staffNameSnapshot`) to the new stylist
 * (AC3), freeing the old slot (its single seat is released because the booking no
 * longer references it). Audits `salon.booking.reassigned`.
 *
 * Reassigning to the stylist who already owns the booking is an idempotent no-op
 * (`unchanged: true`). Throws {@link SalonBookingNotFoundError} when the booking
 * is not a live salon booking, and {@link SalonStylistUnavailableError} when the
 * target stylist is unknown/retired or has no open slot.
 *
 * The COMMISSION side (AC4) is intentionally NOT done here — the ledger helpers
 * live in `@bm/wallet` (which depends on `@bm/catalog`, not the reverse). This
 * function reports `commissionMoved` = "the booking was already settled"; the
 * caller (the reception route) performs the reverse-old / post-new move via the
 * wallet helper. When not yet settled, `commissionMoved` is false and future
 * accrual lands on the new stylist via the existing attribution.
 */
export async function reassignSalonBooking(
  db: Executor,
  input: ReassignSalonBookingInput,
): Promise<ReassignSalonBookingResult> {
  // `Executor` may already be a transaction handle; drizzle's nested `.transaction`
  // is a savepoint, so the caller can thread its own `tx` to keep the attribution
  // move and the commission move (in `@bm/wallet`) atomic in ONE transaction.
  return db.transaction(async (tx) => {
    // Lock the booking so a concurrent reassign / completion serialises.
    const [booking] = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .for("update");
    if (!booking || !booking.salonSlotId || booking.status === "cancelled") {
      throw new SalonBookingNotFoundError(input.bookingId);
    }
    const fromStaffId = booking.staffId;

    // The slot the booking currently occupies (its service + date frame the move).
    const [currentSlot] = await tx
      .select()
      .from(salonSlots)
      .where(eq(salonSlots.id, booking.salonSlotId));
    if (!currentSlot) throw new SalonBookingNotFoundError(input.bookingId);

    // No-op when the booking is already on the target stylist (idempotent).
    if (fromStaffId === input.toStaffId) {
      return {
        bookingId: booking.id,
        fromStaffId: fromStaffId ?? input.toStaffId,
        toStaffId: input.toStaffId,
        newSalonSlotId: booking.salonSlotId,
        oldSalonSlotId: booking.salonSlotId,
        unchanged: true,
        commissionMoved: false,
      };
    }

    // The target stylist must be active.
    const [target] = await tx.select().from(staff).where(eq(staff.id, input.toStaffId));
    if (!target || !target.active) throw new SalonStylistUnavailableError(input.toStaffId);

    // Candidate slots: the target's slots for the SAME service on the SAME date.
    // Ordered by start time so the earliest open slot is chosen deterministically.
    const candidates = await tx
      .select()
      .from(salonSlots)
      .where(
        and(
          eq(salonSlots.staffId, input.toStaffId),
          eq(salonSlots.serviceId, currentSlot.serviceId),
          eq(salonSlots.slotDate, currentSlot.slotDate),
        ),
      )
      .orderBy(asc(salonSlots.startTime));
    if (candidates.length === 0) throw new SalonStylistUnavailableError(input.toStaffId);

    // Lock-then-check each candidate (AC2): take the first whose single seat is
    // still free (no non-cancelled booking consumes it). This serialises against
    // a racing booking/reassign on the same target slot.
    let chosenSlotId: string | null = null;
    for (const cand of candidates) {
      const [locked] = await tx
        .select()
        .from(salonSlots)
        .where(eq(salonSlots.id, cand.id))
        .for("update");
      if (!locked) continue;
      const [taken] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.salonSlotId, locked.id), ne(bookings.status, "cancelled")));
      if (!taken) {
        chosenSlotId = locked.id;
        break;
      }
    }
    if (!chosenSlotId) throw new SalonStylistUnavailableError(input.toStaffId);

    const oldSalonSlotId = booking.salonSlotId;
    // A settled booking already carries a commission accrual (AC4) — report it so
    // the caller can move the ledger. We detect "settled" via a non-pending
    // invoice, which is exactly when the check-in posts the accrual.
    let commissionMoved = false;
    if (booking.invoiceId) {
      const [inv] = await tx.select().from(invoices).where(eq(invoices.id, booking.invoiceId));
      commissionMoved = !!inv && inv.status !== "pending";
    }

    // Repoint the booking + update the attribution snapshot (AC3). The old slot's
    // seat frees because no live booking references it any more.
    await tx
      .update(bookings)
      .set({
        salonSlotId: chosenSlotId,
        staffId: input.toStaffId,
        staffNameSnapshot: target.displayName,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id));

    await audit(tx, {
      actor: input.actor ?? null,
      action: "salon.booking.reassigned",
      target: { table: "bookings", id: booking.id },
      payload: {
        booking_id: booking.id,
        from_staff_id: fromStaffId,
        to_staff_id: input.toStaffId,
        old_salon_slot_id: oldSalonSlotId,
        new_salon_slot_id: chosenSlotId,
        commission_moved: commissionMoved,
        ip: input.ip ?? undefined,
      },
    });

    return {
      bookingId: booking.id,
      fromStaffId: fromStaffId ?? input.toStaffId,
      toStaffId: input.toStaffId,
      newSalonSlotId: chosenSlotId,
      oldSalonSlotId,
      unchanged: false,
      commissionMoved,
    };
  });
}

/* --- Salon service completion (P3-E03-S03 / Story 25.3 AC3) -------------- */

/** The booking is not a salon booking / does not exist. */
export class SalonBookingNotFoundError extends Error {
  constructor(public readonly bookingId: string) {
    super(`Salon booking not found: ${bookingId}`);
    this.name = "SalonBookingNotFoundError";
  }
}

/** The salon service cannot be completed before the child is checked in (AC3). */
export class SalonNotCheckedInError extends Error {
  constructor() {
    super("Check the child in before marking the service complete");
    this.name = "SalonNotCheckedInError";
  }
}

/** The salon service has already been marked complete (idempotency / double-tap). */
export class SalonAlreadyCompletedError extends Error {
  constructor() {
    super("This salon service has already been completed");
    this.name = "SalonAlreadyCompletedError";
  }
}

/**
 * Forward-compatible feedback hook (Story 25.3 AC3 → P5-E04 / Epic 34, NOT yet
 * built). {@link completeSalonService} calls this AFTER the completion commits so
 * the future feedback engine can be wired in by passing a real implementation —
 * today the default is a no-op. The hook never fails the completion (errors are
 * swallowed by the caller). FOLLOW-UP: replace the default with the Epic 34
 * feedback-prompt dispatcher.
 */
export type SalonFeedbackHook = (event: {
  bookingId: string;
  childId: string;
  parentId: string;
  serviceId: string | null;
  /** The stylist the booking is attributed to — drives the per-staff feedback
   *  dashboard + staff-attributed negative-feedback alerts (P5-E04-S02/S03). */
  staffId: string | null;
  completedAt: string;
}) => void | Promise<void>;

/** The default feedback hook — a no-op until P5-E04 (Epic 34) is built. */
export const noopSalonFeedbackHook: SalonFeedbackHook = () => {};

export interface CompleteSalonServiceInput {
  bookingId: string;
  /** Acting staff user id (the audit actor + `completed_by`). */
  actor: string;
  /**
   * Optional photo reference captured at completion (AC3). Stored ONLY when the
   * child's `photoConsent` flag is true — otherwise dropped (consent-gated).
   */
  photoRef?: string | null;
  ip?: string | null;
  /** Injected completion clock (tests). Defaults to now. */
  now?: Date;
}

export interface CompleteSalonServiceResult {
  bookingId: string;
  attendanceId: string;
  completedAt: string;
  /** True only when a photo reference was actually stored (consent satisfied). */
  photoStored: boolean;
  /** True when the photo was dropped because the child has no photo consent (AC3). */
  photoSkippedNoConsent: boolean;
}

/**
 * Mark a salon service complete (AC3). The child must already be checked in (the
 * P2-E03-S02 `attendances` row exists) — completion is the salon counterpart of a
 * hand-off. Sets `completed_at` / `completed_by` on the attendance row; stores the
 * optional `photoRef` ONLY when the child's `photoConsent` is true (consent-gated
 * photo capture); audits `salon.service.completed`; then fires the forward-compatible
 * feedback hook (P5-E04, default no-op).
 *
 * Idempotent guard: re-completing a completed booking throws
 * {@link SalonAlreadyCompletedError}. Throws {@link SalonBookingNotFoundError} /
 * {@link SalonNotCheckedInError}.
 */
export async function completeSalonService(
  db: Database,
  input: CompleteSalonServiceInput,
  feedbackHook: SalonFeedbackHook = noopSalonFeedbackHook,
): Promise<CompleteSalonServiceResult> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId));
  if (!booking || !booking.salonSlotId) throw new SalonBookingNotFoundError(input.bookingId);

  const [attendance] = await db
    .select()
    .from(attendances)
    .where(eq(attendances.bookingId, input.bookingId));
  if (!attendance) throw new SalonNotCheckedInError();
  if (attendance.completedAt) throw new SalonAlreadyCompletedError();

  // Consent gate (AC3): only persist a photo reference when the child consented.
  const [child] = await db.select().from(children).where(eq(children.id, booking.childId));
  const consented = child?.photoConsent === true;
  const photoStored = consented && !!input.photoRef;
  const photoSkippedNoConsent = !consented && !!input.photoRef;
  const photoRef = photoStored ? input.photoRef! : null;

  const completedAt = input.now ?? new Date();
  const attendanceId = await db.transaction(async (tx) => {
    // Guard the completion under a lock so a concurrent double-tap serialises:
    // the second sees `completedAt` set and is rejected.
    const [locked] = await tx
      .select()
      .from(attendances)
      .where(eq(attendances.id, attendance.id))
      .for("update");
    if (locked?.completedAt) throw new SalonAlreadyCompletedError();
    await tx
      .update(attendances)
      .set({ completedAt, completedBy: input.actor, photoRef, updatedAt: completedAt })
      .where(eq(attendances.id, attendance.id));
    await audit(tx, {
      actor: input.actor,
      action: "salon.service.completed",
      target: { table: "attendances", id: attendance.id },
      payload: {
        booking_id: input.bookingId,
        child_id: booking.childId,
        salon_slot_id: booking.salonSlotId,
        service_id: booking.serviceId,
        photo_consent: consented,
        photo_ref: photoRef,
        ip: input.ip ?? undefined,
      },
    });
    return attendance.id;
  });

  // Feedback prompt (AC3 → P5-E04, forward-compatible): fired AFTER the commit so
  // a hook error never rolls back a completed service. Best-effort.
  try {
    await feedbackHook({
      bookingId: input.bookingId,
      childId: booking.childId,
      parentId: booking.parentId,
      serviceId: booking.serviceId,
      staffId: booking.staffId,
      completedAt: completedAt.toISOString(),
    });
  } catch {
    // The feedback engine is a downstream concern — never fail a completion on it.
  }

  return {
    bookingId: input.bookingId,
    attendanceId,
    completedAt: completedAt.toISOString(),
    photoStored,
    photoSkippedNoConsent,
  };
}
