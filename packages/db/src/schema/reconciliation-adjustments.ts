import {
  type AnyPgColumn,
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { floatAccounts } from "./float-accounts.js";

/**
 * `reconciliation_adjustments` (P1-E06-S02) — one row per adjusting entry an
 * operator posts to correct drift between a float account's system-tracked
 * balance (SUM of `wallet_ledger` grouped by `float_account_id`) and its
 * real-world balance.
 *
 * Dual-approval (AC3): an admin POSTS the adjustment (`pending`); a treasury-role
 * user APPROVES it (`approved`). The two actors must be distinct (no
 * self-approval — enforced by a CHECK in the migration).
 *
 * Reversing-entry pattern (AC4): the table is append-only at the application
 * layer — an approved/rejected adjustment is terminal and never mutated. To undo
 * one, a NEW reversing adjustment is posted (`reversesAdjustmentId` → the
 * original, amount negated), preserving the full correction history.
 *
 * Money is integer minor units (KES cents), bigint, signed (an adjustment can be
 * positive or negative). A `rejected` adjustment is terminal.
 */
export const reconciliationAdjustments = pgTable(
  "reconciliation_adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Float account this adjustment corrects. */
    floatAccountId: uuid("float_account_id")
      .notNull()
      .references(() => floatAccounts.id),
    /** Signed integer cents (KES * 100). Non-zero (CHECK in the migration). */
    amount: bigint("amount", { mode: "number" }).notNull(),
    /** Why the adjustment is being made (required — AC3). */
    reason: text("reason").notNull(),
    /** The admin who posted the adjustment (users.id). */
    postedBy: uuid("posted_by")
      .notNull()
      .references(() => users.id),
    /** The treasury user who approved it (users.id). NULL while pending. */
    approvedBy: uuid("approved_by").references(() => users.id),
    /** `pending` | `approved` | `rejected` — CHECK-constrained in the migration. */
    status: text("status").notNull().default("pending"),
    /** Reversing-entry pattern (AC4): the prior adjustment this one reverses, if any. */
    reversesAdjustmentId: uuid("reverses_adjustment_id").references(
      (): AnyPgColumn => reconciliationAdjustments.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    floatAccountIdIdx: index("reconciliation_adjustments_float_account_id_idx").on(
      t.floatAccountId,
      t.createdAt,
    ),
    statusIdx: index("reconciliation_adjustments_status_idx").on(t.status),
  }),
);

export type ReconciliationAdjustmentRow = typeof reconciliationAdjustments.$inferSelect;
export type ReconciliationAdjustmentInsert = typeof reconciliationAdjustments.$inferInsert;
