import { index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { staff } from "./staff.js";

/**
 * Per-staff commission rate with effective dating (P3-E01-S01). Each row is a
 * rate valid over the HALF-OPEN interval `[effectiveFrom, effectiveTo)`: the rate
 * in force for a booking is the row whose `effectiveFrom <= created_at` and
 * (`effectiveTo` is null OR `created_at < effectiveTo`). Setting a new rate
 * auto-closes the previous open one by stamping its `effectiveTo` to the new
 * `effectiveFrom` (AC2) — done atomically so there is never an overlap or gap.
 * `effectiveTo` null marks the single currently-open rate (the partial unique
 * index `one_open_per_staff` in migration 0059 fences a double-open race).
 *
 * `ratePercent` is a decimal percentage. drizzle returns numeric as a STRING to
 * preserve precision — e.g. "12.50" = 12.5%. The commission amount it produces
 * is always computed in INTEGER cents so the ledger never drifts. The 0..100
 * range + non-zero-width interval CHECKs live in the SQL migration (the runtime
 * source of truth), mirroring the rest of the schema (e.g. service_prices).
 */
export const staffCommissionRates = pgTable(
  "staff_commission_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    /** Decimal percentage as a string (numeric(5,2) — "12.50" = 12.5%). */
    ratePercent: numeric("rate_percent", { precision: 5, scale: 2 }).notNull(),
    /** Inclusive start of the validity interval. */
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    /** Exclusive end; null while this is the currently-open rate. */
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    /** Optional human-readable reason for the change (AC1). */
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    staffEffIdx: index("staff_commission_rates_staff_eff_idx").on(t.staffId, t.effectiveFrom),
    oneOpenPerStaff: uniqueIndex("staff_commission_rates_one_open_per_staff")
      .on(t.staffId)
      .where(sql`${t.effectiveTo} IS NULL`),
  }),
);

export type StaffCommissionRateRow = typeof staffCommissionRates.$inferSelect;
export type StaffCommissionRateInsert = typeof staffCommissionRates.$inferInsert;
