import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * `services` (P1-E07-S01) — the paid services the centre offers, managed by
 * admin without code changes. `unit` is CHECK-constrained in the migration to
 * the contract enum (`play` | `talent` | `salon` | `coaching` | `event`).
 *
 * No hard deletes — a retired service is soft-deleted via `isActive = false`
 * (AC: Technical Notes) so booking history that references it keeps its FK.
 * `attributionRoleRequired` is an optional staff attribution role that a booking
 * of this service must be attributed to (nullable ENUM — P1-E07-S02).
 *
 * Prices are NOT stored here — they live in effective-dated rows on
 * `service_prices` so a price change never overwrites history (see that table).
 */

/**
 * Staff attribution roles (P1-E07-S02 AC1). Mirrors `ATTRIBUTION_ROLES` in
 * `@bm/contracts` and the `staff.role` taxonomy of P1-E07-S03; CHECK-constrained
 * in migration 0029. db has no dependency on contracts, so the literal union is
 * duplicated here — the migration CHECK is the runtime source of truth.
 */
export type AttributionRole = "stylist" | "instructor" | "attendant" | "coach" | "event_staff";

/**
 * Tax treatment a service declares (P1-E07-S04 AC1). A non-null ENUM on
 * `services` defaulting to `vat_exempt` (KRA registration deferred — AC3),
 * consumed by the receipt engine (P1-E08) + eTIMS (P5). Mirrors `TAX_TREATMENTS`
 * in `@bm/contracts`; CHECK-constrained in migration 0031. db has no dependency
 * on contracts, so the literal union is duplicated here — the migration CHECK is
 * the runtime source of truth.
 */
export type TaxTreatment = "vat_inclusive" | "vat_exclusive" | "vat_exempt" | "zero_rated";

/**
 * Coaching session format (P5-E01-S01 / Story 31.1 AC2). A nullable ENUM on
 * `services`: only coaching offerings (`unit = 'coaching'`) carry one. Mirrors
 * `COACHING_FORMATS` in `@bm/contracts`; CHECK-constrained in migration 0096. db
 * has no dependency on contracts, so the literal union is duplicated here — the
 * migration CHECK is the runtime source of truth.
 */
export type CoachingFormat = "one_to_one" | "group";
export const services = pgTable("services", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  /** `play` | `talent` | `salon` | `coaching` | `event` — CHECK-constrained in the migration. */
  unit: text("unit").notNull(),
  /** Soft on/off — inactive services are not offered for new bookings. */
  isActive: boolean("is_active").notNull().default(true),
  /**
   * Optional staff attribution role a booking of this service must be attributed
   * to (nullable ENUM — P1-E07-S02 AC1). CHECK-constrained in migration 0029 to
   * the `staff.role` taxonomy. Null = attribution optional (AC3); non-null =
   * Reception must pick a `staff` member of that role (AC2).
   */
  attributionRoleRequired: text("attribution_role_required").$type<AttributionRole>(),
  /**
   * VAT / tax treatment this service declares (P1-E07-S04 AC1). Non-null,
   * defaults to `vat_exempt` (AC3). CHECK-constrained in migration 0031 to
   * {`vat_inclusive` | `vat_exclusive` | `vat_exempt` | `zero_rated`}. Consumed
   * by the receipt engine (P1-E08) + eTIMS (P5) to compute / display line-tax.
   */
  taxTreatment: text("tax_treatment").$type<TaxTreatment>().notNull().default("vat_exempt"),
  /**
   * Optional age-eligibility range in MONTHS (P2-E01-S02 AC2). Nullable bounds:
   * null min = no lower bound, null max = no upper bound, both null = open to all
   * ages. The booking-browse flow filters slots to children whose
   * {@link ageInMonths} falls within `[ageMinMonths, ageMaxMonths]`.
   */
  ageMinMonths: integer("age_min_months"),
  ageMaxMonths: integer("age_max_months"),
  /**
   * Hours before a booked slot's start that a parent may still reschedule online
   * (P2-E01-S05). Default 2; after the cut-off the online move is refused.
   */
  rescheduleCutoffHours: integer("reschedule_cutoff_hours").notNull().default(2),
  /** Cancellation fee in integer cents applied after the cut-off (P2-E01-S06). 0 = none. */
  cancellationFeeCents: bigint("cancellation_fee_cents", { mode: "number" }).notNull().default(0),
  /**
   * Salon appointment length in MINUTES (P3-E03-S01 / Story 25.1). Only
   * `unit = 'salon'` services carry one; nullable + positive when set
   * (CHECK-constrained in migration 0088). The nightly salon-slot generator chops
   * a stylist's availability window into back-to-back slots of this length. Null =
   * the service is not (yet) bookable as discrete salon slots.
   */
  salonDurationMinutes: integer("salon_duration_minutes"),
  /**
   * Coaching session format (P5-E01-S01 / Story 31.1 AC2). Only `unit =
   * 'coaching'` offerings carry one; nullable + CHECK-constrained in migration
   * 0096 to {`one_to_one` | `group`}. Null = not a coaching offering (or format
   * unset). The coach is a `staff` record assigned via `attributionRoleRequired
   * = 'coach'` (P1-E07-S02; no login — AC3).
   */
  format: text("format").$type<CoachingFormat>(),
  /**
   * Coaching session length in MINUTES (P5-E01-S01 / Story 31.1 AC2). Nullable +
   * positive when set (CHECK-constrained in migration 0096). Kept separate from
   * `salonDurationMinutes` so the two unit-specific durations never collide.
   */
  coachingDurationMinutes: integer("coaching_duration_minutes"),
  /**
   * Group coaching capacity (P5-E01-S03 / Story 31.3 AC1): seats per generated
   * slot. Nullable + CHECK >= 1 in migration 0098; only `unit = 'coaching'`
   * offerings carry one. NULL = unset (treated as 1, a 1:1 private hold). A
   * `one_to_one` offering is capacity 1; a `group` offering is capacity N (> 1).
   * The bookable {@link coachingSlots} take a SNAPSHOT of this at generation time.
   */
  coachingCapacity: integer("coaching_capacity"),
  /**
   * Optional, FREE-SET age-stage tags for a coaching offering (P5-E01-S01 AC2):
   * "expecting", "0-3mo", "3-6mo", ... A text[] (nullable); null = no tags. A free
   * set rather than an enum so admin can coin new stages without a migration.
   */
  ageStageTags: text("age_stage_tags").array().$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ServiceRow = typeof services.$inferSelect;
export type ServiceInsert = typeof services.$inferInsert;

/**
 * `service_prices` (P1-E07-S01) — effective-dated price history for a service.
 * A price change NEVER mutates an amount in place: it closes the current open
 * row by setting `effectiveTo`, then inserts a new row with the new amount and a
 * null `effectiveTo` (AC3). The price applicable at a booking date is the row
 * whose `[effectiveFrom, effectiveTo)` half-open range contains that date (AC4):
 * `effectiveFrom <= bookingDate AND (effectiveTo IS NULL OR bookingDate < effectiveTo)`.
 *
 * `amountCents` is **integer minor units (KES cents)** — `bigint`, like the
 * ledger — so there is zero float drift.
 */
export const servicePrices = pgTable(
  "service_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    /** Price in integer cents (KES * 100). Non-negative (a free service is allowed). */
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    /** Calendar date this price takes effect (inclusive lower bound). */
    effectiveFrom: date("effective_from").notNull(),
    /** Calendar date this price stops applying (exclusive upper bound); null = open/current. */
    effectiveTo: date("effective_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    serviceIdIdx: index("service_prices_service_id_effective_from_idx").on(
      t.serviceId,
      t.effectiveFrom,
    ),
  }),
);

export type ServicePriceRow = typeof servicePrices.$inferSelect;
export type ServicePriceInsert = typeof servicePrices.$inferInsert;
