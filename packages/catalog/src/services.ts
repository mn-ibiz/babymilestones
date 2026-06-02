import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  services,
  servicePrices,
  type AttributionRole,
  type CoachingFormat,
  type Database,
  type ServiceRow,
  type TaxTreatment,
  type Transaction,
} from "@bm/db";

/** A drizzle executor — the top-level db or a transaction handle. */
export type Executor = Database | Transaction;

/**
 * Raised by {@link setServicePrice} when a new price's `effectiveFrom` is not
 * strictly after the current open price's `effectiveFrom`. The history is
 * append-forward only — a new price cannot start on/before the current one.
 */
export class ServicePriceOrderError extends Error {
  constructor(
    public readonly currentEffectiveFrom: string,
    public readonly attemptedEffectiveFrom: string,
  ) {
    super(
      `New price effectiveFrom (${attemptedEffectiveFrom}) must be after the current price's effectiveFrom (${currentEffectiveFrom})`,
    );
    this.name = "ServicePriceOrderError";
  }
}

/** The unit kinds a service may have (mirrors the migration CHECK + contract enum). */
export const SERVICE_UNITS = ["play", "talent", "salon", "coaching", "event"] as const;
export type ServiceUnit = (typeof SERVICE_UNITS)[number];

/**
 * Staff attribution roles a service may require (P1-E07-S02 AC1). Mirrors
 * `ATTRIBUTION_ROLES` in `@bm/contracts` and the `staff.role` taxonomy from
 * P1-E07-S03; CHECK-constrained in migration 0029.
 */
export const ATTRIBUTION_ROLES = [
  "stylist",
  "instructor",
  "attendant",
  "coach",
  "event_staff",
] as const satisfies readonly AttributionRole[];

/** True when `value` is one of the allowed attribution roles (narrowing guard). */
export function isAttributionRole(value: unknown): value is AttributionRole {
  return typeof value === "string" && (ATTRIBUTION_ROLES as readonly string[]).includes(value);
}

/**
 * VAT / tax treatments a service may declare (P1-E07-S04 AC1). Mirrors
 * `TAX_TREATMENTS` in `@bm/contracts`; CHECK-constrained in migration 0031.
 */
export const TAX_TREATMENTS = [
  "vat_inclusive",
  "vat_exclusive",
  "vat_exempt",
  "zero_rated",
] as const satisfies readonly TaxTreatment[];

/** The default treatment for a new service — KRA registration deferred (AC3). */
export const DEFAULT_TAX_TREATMENT: TaxTreatment = "vat_exempt";

/** True when `value` is one of the allowed tax treatments (narrowing guard). */
export function isTaxTreatment(value: unknown): value is TaxTreatment {
  return typeof value === "string" && (TAX_TREATMENTS as readonly string[]).includes(value);
}

/**
 * Coaching session formats a coaching offering may declare (P5-E01-S01 / Story
 * 31.1 AC2). A nullable ENUM on `services`; mirrors `COACHING_FORMATS` in
 * `@bm/contracts` and is CHECK-constrained in migration 0096.
 */
export const COACHING_FORMATS = ["one_to_one", "group"] as const satisfies readonly CoachingFormat[];

/** True when `value` is one of the allowed coaching formats (narrowing guard). */
export function isCoachingFormat(value: unknown): value is CoachingFormat {
  return typeof value === "string" && (COACHING_FORMATS as readonly string[]).includes(value);
}

export interface CreateServiceInput {
  name: string;
  description?: string | null;
  unit: ServiceUnit;
  attributionRoleRequired?: AttributionRole | null;
  /** VAT / tax treatment (P1-E07-S04 AC1). Defaults to `vat_exempt` (AC3). */
  taxTreatment?: TaxTreatment;
  /** Optional age-eligibility range in months (P2-E01-S02 AC2). Null = unbounded. */
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  /** Reschedule cut-off in hours before the slot (P2-E01-S05). Defaults to 2. */
  rescheduleCutoffHours?: number;
  /** Cancellation fee in integer cents (P2-E01-S06). Defaults to 0. */
  cancellationFeeCents?: number;
  /**
   * Salon appointment length in MINUTES (P3-E03-S01 / Story 25.1). Only meaningful
   * for `unit = 'salon'` services; null/omitted = not bookable as discrete salon
   * slots yet. The nightly salon-slot generator chops a stylist's availability
   * window into back-to-back slots of this length.
   */
  salonDurationMinutes?: number | null;
  /**
   * Coaching session format (P5-E01-S01 AC2). Only meaningful for `unit =
   * 'coaching'`; null/omitted = unset. CHECK-constrained to {one_to_one | group}.
   */
  format?: CoachingFormat | null;
  /** Coaching session length in minutes (P5-E01-S01 AC2). Positive when set; null = unset. */
  coachingDurationMinutes?: number | null;
  /**
   * Group coaching capacity (P5-E01-S03 AC1): seats per generated slot. Only
   * meaningful for `unit = 'coaching'`; null/omitted = unset (treated as 1, a 1:1
   * hold). `1` = a 1:1 offering; `> 1` = a group offering. CHECK-constrained to ≥ 1.
   */
  coachingCapacity?: number | null;
  /**
   * Optional free-set age-stage tags for a coaching offering (P5-E01-S01 AC2),
   * e.g. ["expecting", "0-3mo"]. Null/omitted = no tags; an empty array persists
   * as an empty set (distinct from null).
   */
  ageStageTags?: string[] | null;
  /**
   * Discreet-billing toggle (P5-E01-S05 / Story 31.5 AC3). Default false. When
   * true, receipts + coaching SMS use {@link discreetBillingLabel} in place of the
   * real, sensitive service name. Display-only — never changes the stored line.
   */
  discreetBillingEnabled?: boolean;
  /**
   * Neutral display label shown when discreet billing is enabled (P5-E01-S05 AC1),
   * e.g. "BM Coaching Session". Null/omitted when off; required + non-blank when
   * enabled (DB CHECK + contract). The contract collapses a stray label to null.
   */
  discreetBillingLabel?: string | null;
}

/** Create a service (AC1). Always created active. Returns the new row. */
export async function createService(db: Executor, input: CreateServiceInput) {
  const [row] = await db
    .insert(services)
    .values({
      name: input.name,
      description: input.description ?? null,
      unit: input.unit,
      attributionRoleRequired: input.attributionRoleRequired ?? null,
      taxTreatment: input.taxTreatment ?? DEFAULT_TAX_TREATMENT,
      ageMinMonths: input.ageMinMonths ?? null,
      ageMaxMonths: input.ageMaxMonths ?? null,
      format: input.format ?? null,
      coachingDurationMinutes: input.coachingDurationMinutes ?? null,
      coachingCapacity: input.coachingCapacity ?? null,
      // An explicit (possibly empty) array is preserved; absent → null (no tags).
      ageStageTags: input.ageStageTags ?? null,
      // Discreet billing (P5-E01-S05): default off, label null unless enabled.
      discreetBillingEnabled: input.discreetBillingEnabled ?? false,
      discreetBillingLabel: input.discreetBillingLabel ?? null,
      ...(input.rescheduleCutoffHours !== undefined
        ? { rescheduleCutoffHours: input.rescheduleCutoffHours }
        : {}),
      ...(input.cancellationFeeCents !== undefined
        ? { cancellationFeeCents: input.cancellationFeeCents }
        : {}),
      ...(input.salonDurationMinutes !== undefined
        ? { salonDurationMinutes: input.salonDurationMinutes }
        : {}),
    })
    .returning();
  return row!;
}

export interface UpdateServiceInput {
  name?: string;
  description?: string | null;
  /** Soft-delete via `isActive = false` — there are NO hard deletes (Technical Notes). */
  isActive?: boolean;
  attributionRoleRequired?: AttributionRole | null;
  /** VAT / tax treatment (P1-E07-S04 AC1). Non-null — only changed when present. */
  taxTreatment?: TaxTreatment;
  /** Age-eligibility range in months (P2-E01-S02). Null clears the bound. */
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  /** Reschedule cut-off in hours before the slot (P2-E01-S05). */
  rescheduleCutoffHours?: number;
  /** Cancellation fee in integer cents (P2-E01-S06). */
  cancellationFeeCents?: number;
  /** Salon appointment length in minutes (P3-E03-S01); null clears it. */
  salonDurationMinutes?: number | null;
  /** Coaching session format (P5-E01-S01 AC2); null clears it. */
  format?: CoachingFormat | null;
  /** Coaching session length in minutes (P5-E01-S01 AC2); null clears it. */
  coachingDurationMinutes?: number | null;
  /** Group coaching capacity in seats (P5-E01-S03 AC1); null clears it (= 1, a 1:1 hold). */
  coachingCapacity?: number | null;
  /** Free-set age-stage tags (P5-E01-S01 AC2); null clears them, [] = empty set. */
  ageStageTags?: string[] | null;
  /** Discreet-billing toggle (P5-E01-S05 AC3); only changed when present. */
  discreetBillingEnabled?: boolean;
  /** Neutral discreet-billing label (P5-E01-S05 AC1); null clears it. */
  discreetBillingLabel?: string | null;
}

/**
 * Update a service (AC1). Partial patch; `unit` is intentionally immutable after
 * creation (it changes booking semantics). Retiring a service is `isActive=false`
 * — never a hard delete, so booking history keeps its FK. Returns the updated row
 * or null when the id is unknown.
 */
export async function updateService(db: Executor, id: string, patch: UpdateServiceInput) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.attributionRoleRequired !== undefined)
    set.attributionRoleRequired = patch.attributionRoleRequired;
  if (patch.taxTreatment !== undefined) set.taxTreatment = patch.taxTreatment;
  if (patch.ageMinMonths !== undefined) set.ageMinMonths = patch.ageMinMonths;
  if (patch.ageMaxMonths !== undefined) set.ageMaxMonths = patch.ageMaxMonths;
  if (patch.rescheduleCutoffHours !== undefined) set.rescheduleCutoffHours = patch.rescheduleCutoffHours;
  if (patch.cancellationFeeCents !== undefined) set.cancellationFeeCents = patch.cancellationFeeCents;
  if (patch.salonDurationMinutes !== undefined) set.salonDurationMinutes = patch.salonDurationMinutes;
  if (patch.format !== undefined) set.format = patch.format;
  if (patch.coachingDurationMinutes !== undefined)
    set.coachingDurationMinutes = patch.coachingDurationMinutes;
  if (patch.coachingCapacity !== undefined) set.coachingCapacity = patch.coachingCapacity;
  if (patch.ageStageTags !== undefined) set.ageStageTags = patch.ageStageTags;
  if (patch.discreetBillingEnabled !== undefined)
    set.discreetBillingEnabled = patch.discreetBillingEnabled;
  if (patch.discreetBillingLabel !== undefined)
    set.discreetBillingLabel = patch.discreetBillingLabel;
  const [row] = await db.update(services).set(set).where(eq(services.id, id)).returning();
  return row ?? null;
}

/** Read one service by id, or null. */
export async function getService(db: Executor, id: string) {
  const [row] = await db.select().from(services).where(eq(services.id, id));
  return row ?? null;
}

/** List services, newest first. Pass `activeOnly` to exclude soft-deleted rows. */
export async function listServices(db: Executor, opts: { activeOnly?: boolean } = {}) {
  if (opts.activeOnly) {
    return db
      .select()
      .from(services)
      .where(eq(services.isActive, true))
      .orderBy(desc(services.createdAt));
  }
  return db.select().from(services).orderBy(desc(services.createdAt));
}

/**
 * List services of a single unit, newest first (P5-E01-S01 — the coaching
 * catalogue reads its offerings via `unit = 'coaching'`). Pass `activeOnly` to
 * exclude soft-deleted rows.
 */
export async function listServicesByUnit(
  db: Executor,
  unit: ServiceUnit,
  opts: { activeOnly?: boolean } = {},
) {
  const where = opts.activeOnly
    ? and(eq(services.unit, unit), eq(services.isActive, true))
    : eq(services.unit, unit);
  return db.select().from(services).where(where).orderBy(desc(services.createdAt));
}

/**
 * Set a new effective-dated price for a service (AC2/AC3). NEVER mutates an
 * amount in place: it closes the currently-open price row (the one with a null
 * `effectiveTo`) by setting its `effectiveTo` to `effectiveFrom`, then inserts a
 * new open row with the new amount. Runs in a transaction so the close + insert
 * are atomic. Returns the newly inserted price row.
 *
 * `effectiveFrom` is a YYYY-MM-DD calendar date. The new row's range is
 * `[effectiveFrom, null)` (open/current).
 */
export async function setServicePrice(
  db: Database,
  input: { serviceId: string; amountCents: number; effectiveFrom: string },
) {
  return db.transaction(async (tx) => {
    // Find the current open row (null effectiveTo). A new price must start
    // strictly AFTER it — otherwise closing the old row to `effectiveFrom` would
    // produce an invalid (from >= to) range and the catalogue would gain a
    // backdated price the lookup can't order. Reject rather than corrupt history.
    const [open] = await tx
      .select()
      .from(servicePrices)
      .where(and(eq(servicePrices.serviceId, input.serviceId), isNull(servicePrices.effectiveTo)));
    if (open && input.effectiveFrom <= open.effectiveFrom) {
      throw new ServicePriceOrderError(open.effectiveFrom, input.effectiveFrom);
    }
    // Close the current open row (if any) at the new price's start date.
    await tx
      .update(servicePrices)
      .set({ effectiveTo: input.effectiveFrom })
      .where(
        and(eq(servicePrices.serviceId, input.serviceId), isNull(servicePrices.effectiveTo)),
      );
    const [row] = await tx
      .insert(servicePrices)
      .values({
        serviceId: input.serviceId,
        amountCents: input.amountCents,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
      })
      .returning();
    return row!;
  });
}

/** Full price history for a service, oldest first. */
export async function listServicePrices(db: Executor, serviceId: string) {
  return db
    .select()
    .from(servicePrices)
    .where(eq(servicePrices.serviceId, serviceId))
    .orderBy(asc(servicePrices.effectiveFrom));
}

/**
 * Resolve the price applicable to a service at a booking date (AC4). Returns the
 * row whose half-open range `[effectiveFrom, effectiveTo)` contains `bookingDate`:
 * `effectiveFrom <= bookingDate AND (effectiveTo IS NULL OR bookingDate < effectiveTo)`.
 * Returns null when no price covers the date (e.g. before the first effectiveFrom).
 *
 * `bookingDate` is a YYYY-MM-DD calendar date. The comparison is on the ISO
 * string, which is lexicographically ordered the same as the calendar for
 * zero-padded YYYY-MM-DD, so no Date parsing is needed.
 */
export async function resolveServicePriceAt(
  db: Executor,
  serviceId: string,
  bookingDate: string,
) {
  const rows = await db
    .select()
    .from(servicePrices)
    .where(eq(servicePrices.serviceId, serviceId))
    .orderBy(asc(servicePrices.effectiveFrom));
  for (const row of rows) {
    const fromOk = row.effectiveFrom <= bookingDate;
    const toOk = row.effectiveTo === null || bookingDate < row.effectiveTo;
    if (fromOk && toOk) return row;
  }
  return null;
}

/**
 * The attribution role a service requires, or null when attribution is optional
 * (P1-E07-S02 AC2/AC3). A thin read over the service's `attributionRoleRequired`
 * — the single primitive the Reception booking flow uses to decide whether a
 * `staff` pick is mandatory (non-null role → must attribute to an active staff
 * member of that role) or optional (null). Returns `undefined` when the service
 * id is unknown so callers can distinguish "no such service" from "optional".
 */
export async function getServiceAttributionRole(
  db: Executor,
  serviceId: string,
): Promise<AttributionRole | null | undefined> {
  const [row] = await db
    .select({ attributionRoleRequired: services.attributionRoleRequired })
    .from(services)
    .where(eq(services.id, serviceId));
  if (!row) return undefined;
  return row.attributionRoleRequired ?? null;
}

/**
 * Booking-flow attribution gate (P1-E07-S02 AC2/AC3). Given a service's required
 * attribution role and a chosen staff member (its role + active flag, loaded by
 * the caller from the P1-E07-S03 `staff` records), decides whether the booking
 * may proceed:
 *  - role is null  → attribution optional; any pick (incl. none) is allowed (AC3).
 *  - role non-null → a staff member MUST be supplied, MUST be active, and MUST
 *    hold exactly that role (AC2). Otherwise the booking is rejected with a reason.
 *
 * Pure (no DB) so the Reception route can call it after loading the catalogue +
 * staff rows. The actual `staff` table + the route wiring land with P1-E07-S03 /
 * the Reception surface; this is the shared rule both will enforce.
 */
export type AttributionCheck =
  | { ok: true }
  | { ok: false; reason: "staff_required" | "staff_inactive" | "staff_role_mismatch" };

export function checkBookingAttribution(
  requiredRole: AttributionRole | null,
  staff: { role: AttributionRole; isActive: boolean } | null,
): AttributionCheck {
  if (requiredRole === null) return { ok: true }; // AC3 — optional.
  if (!staff) return { ok: false, reason: "staff_required" }; // AC2 — pick is forced.
  if (!staff.isActive) return { ok: false, reason: "staff_inactive" }; // AC2 — active members only.
  if (staff.role !== requiredRole) return { ok: false, reason: "staff_role_mismatch" }; // AC2 — that role.
  return { ok: true };
}

/** Re-export for callers that take the full row but only need its attribution role. */
export function serviceAttributionRole(row: Pick<ServiceRow, "attributionRoleRequired">) {
  return row.attributionRoleRequired ?? null;
}

/**
 * The tax treatment a service declares (P1-E07-S04 AC1). A thin read used by the
 * receipt engine (P1-E08) + eTIMS (P5). Returns `undefined` when the service id
 * is unknown so callers can distinguish "no such service" from a treatment.
 */
export async function getServiceTaxTreatment(
  db: Executor,
  serviceId: string,
): Promise<TaxTreatment | undefined> {
  const [row] = await db
    .select({ taxTreatment: services.taxTreatment })
    .from(services)
    .where(eq(services.id, serviceId));
  if (!row) return undefined;
  return row.taxTreatment;
}

/** Re-export for callers that take the full row but only need its tax treatment. */
export function serviceTaxTreatment(row: Pick<ServiceRow, "taxTreatment">): TaxTreatment {
  return row.taxTreatment;
}

/**
 * Kenyan standard VAT rate in basis points (16% = 1600 bps). Kept as an integer
 * so line-tax math is exact (no float). When KRA registration lands (AC3 is
 * deferred), the effective rate can become config-driven; for now the receipt
 * engine passes it explicitly so this helper stays pure + rate-agnostic.
 */
export const KENYA_VAT_RATE_BPS = 1600;

/** The computed tax split for a single receipt line (P1-E07-S04 AC2 input). */
export interface LineTax {
  /** The treatment this line was computed under. */
  treatment: TaxTreatment;
  /** Net (pre-VAT) amount in integer cents. */
  netCents: number;
  /** VAT amount in integer cents (0 for exempt / zero-rated). */
  taxCents: number;
  /** Gross (net + tax) amount in integer cents — equals the input for inclusive. */
  grossCents: number;
  /** The VAT rate applied, in basis points (0 for exempt / zero-rated). */
  rateBps: number;
}

/**
 * Compute the line-tax split for a service line given its tax treatment and a
 * price in integer cents (P1-E07-S04 AC2). Pure + float-free so the receipt
 * engine (P1-E08) and eTIMS (P5) compute identically. Rounding is half-up on
 * the cent. `rateBps` defaults to the Kenyan standard rate.
 *
 *  - `vat_exclusive` → `amountCents` is net; tax is added on top.
 *  - `vat_inclusive` → `amountCents` is gross; tax is backed out of it.
 *  - `vat_exempt` / `zero_rated` → no tax (rate 0); net == gross.
 */
export function computeLineTax(
  treatment: TaxTreatment,
  amountCents: number,
  rateBps: number = KENYA_VAT_RATE_BPS,
): LineTax {
  const amount = Math.round(amountCents);
  if (treatment === "vat_exempt" || treatment === "zero_rated") {
    return { treatment, netCents: amount, taxCents: 0, grossCents: amount, rateBps: 0 };
  }
  if (treatment === "vat_exclusive") {
    const taxCents = Math.round((amount * rateBps) / 10_000);
    return { treatment, netCents: amount, taxCents, grossCents: amount + taxCents, rateBps };
  }
  // vat_inclusive: back the tax portion out of the gross amount.
  const netCents = Math.round((amount * 10_000) / (10_000 + rateBps));
  return { treatment, netCents, taxCents: amount - netCents, grossCents: amount, rateBps };
}
