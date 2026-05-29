import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { services } from "./services.js";
import { parents } from "./parents.js";
import { children } from "./children.js";

/** Billing/entitlement period of a subscription plan. */
export type SubscriptionPeriod = "week" | "month" | "term";

/** Lifecycle status of a parent subscription. */
export type SubscriptionStatus = "active" | "paused" | "cancelled" | "dunning";

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

/**
 * `subscriptions` (P2-E02-S02) — a parent+child enrolled in a plan. The full
 * period is pre-paid from the wallet at creation; `entitlementRemaining`
 * bookings are granted for the current period (deducted first by the booking
 * flow, P2-E02-S03). Status drives pause/resume (S04), cancel (S06) and renewal
 * (S05). CHECK-constrained in migration 0047.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    status: text("status").$type<SubscriptionStatus>().notNull().default("active"),
    /** Bookings left in the current period (>= 0). */
    entitlementRemaining: integer("entitlement_remaining").notNull(),
    /** Start of the current pause (P2-E02-S04); null while active/cancelled. */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    /** When the subscription entered dunning (P2-E02-S05); anchors the grace window. */
    dunningSince: timestamp("dunning_since", { withTimezone: true }),
    /** Scheduled cancellation (P2-E02-S06): renewal terminates at period end instead of charging. */
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    /** Closed pause intervals `[{ pausedAt, resumedAt }]` for audit/reporting. */
    pauseHistory: jsonb("pause_history")
      .$type<Array<{ pausedAt: string; resumedAt: string }>>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parentIdIdx: index("subscriptions_parent_id_idx").on(t.parentId),
    childIdIdx: index("subscriptions_child_id_idx").on(t.childId),
    // At most one LIVE (active or paused) subscription per (child, plan) — the
    // durable fence + subscribe idempotency anchor. Paused subs still count, so
    // re-subscribing (a second charge) is blocked until cancellation.
    childPlanLiveUniq: uniqueIndex("subscriptions_child_plan_live_uniq")
      .on(t.childId, t.planId)
      .where(sql`status <> 'cancelled'`),
  }),
);

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type SubscriptionInsert = typeof subscriptions.$inferInsert;
