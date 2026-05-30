import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Effective-dated loyalty rates (P2-E05-S02). Append-only: a rate change inserts
 * a NEW row; prior rows are never mutated, so the earn/redeem rates under which
 * historical points were earned or redeemed are preserved (AC2).
 *
 *   rateType `earn`   — KES of qualifying spend per 1 point (default 100)
 *   rateType `redeem` — KES value of 1 point at redemption (default 1)
 *
 * `getEffectiveRates(at)` (in @bm/wallet) selects the latest row with
 * `effectiveFrom <= at` for each rate type.
 */
export const loyaltyRates = pgTable(
  "loyalty_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rateType: text("rate_type").notNull(), // 'earn' | 'redeem'
    value: integer("value").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => ({
    typeEffectiveIdx: index("loyalty_rates_type_effective_idx").on(
      t.rateType,
      t.effectiveFrom,
    ),
  }),
);

export type LoyaltyRateRow = typeof loyaltyRates.$inferSelect;
export type LoyaltyRateInsert = typeof loyaltyRates.$inferInsert;
