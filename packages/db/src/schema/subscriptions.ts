import { bigint, boolean, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { services } from "./services.js";

/** Billing/entitlement period of a subscription plan. */
export type SubscriptionPeriod = "week" | "month" | "term";

/**
 * `subscription_plans` (P2-E02-S01) — an admin-managed plan granting
 * `entitlementCount` bookings of a service per `period` (e.g. "8 Play sessions
 * per month"). Soft-retired via `isActive=false`. Price is effective-dated in
 * {@link subscriptionPlanPrices}. CHECK-constrained in migration 0046.
 */
export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    name: text("name").notNull(),
    /** Bookings granted per period (> 0). */
    entitlementCount: integer("entitlement_count").notNull(),
    period: text("period").$type<SubscriptionPeriod>().notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    serviceIdIdx: index("subscription_plans_service_id_idx").on(t.serviceId),
  }),
);

export type SubscriptionPlanRow = typeof subscriptionPlans.$inferSelect;
export type SubscriptionPlanInsert = typeof subscriptionPlans.$inferInsert;

/**
 * `subscription_plan_prices` (P2-E02-S01 AC3) — effective-dated price history for
 * a plan, mirroring `service_prices`: at most one open row (`effectiveTo` null)
 * per plan; a price change closes the open row and inserts a new one.
 */
export const subscriptionPlanPrices = pgTable(
  "subscription_plan_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    /** Price in integer cents (KES * 100). Non-negative. */
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    planIdIdx: index("subscription_plan_prices_plan_id_idx").on(t.planId, t.effectiveFrom),
  }),
);

export type SubscriptionPlanPriceRow = typeof subscriptionPlanPrices.$inferSelect;
export type SubscriptionPlanPriceInsert = typeof subscriptionPlanPrices.$inferInsert;
