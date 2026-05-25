import { bigint, boolean, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * `services` (P1-E07-S01) — the paid services the centre offers, managed by
 * admin without code changes. `unit` is CHECK-constrained in the migration to
 * the contract enum (`play` | `talent` | `salon` | `coaching` | `event`).
 *
 * No hard deletes — a retired service is soft-deleted via `isActive = false`
 * (AC: Technical Notes) so booking history that references it keeps its FK.
 * `attributionRoleRequired` is an optional staff role that a booking of this
 * service must be attributed to (nullable).
 *
 * Prices are NOT stored here — they live in effective-dated rows on
 * `service_prices` so a price change never overwrites history (see that table).
 */
export const services = pgTable("services", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  /** `play` | `talent` | `salon` | `coaching` | `event` — CHECK-constrained in the migration. */
  unit: text("unit").notNull(),
  /** Soft on/off — inactive services are not offered for new bookings. */
  isActive: boolean("is_active").notNull().default(true),
  /** Optional staff role a booking of this service must be attributed to (nullable). */
  attributionRoleRequired: text("attribution_role_required"),
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
