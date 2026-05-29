import { bigint, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { reconciliationAdjustments } from "./reconciliation-adjustments.js";

/**
 * `pos_cashups` (P2-E04-S05) — one end-of-day till close per row. Captures the
 * expected takings by method (summed from paid `pos_sales` since this cashier's
 * previous cash-up), the cash the cashier physically counted, and the variance
 * (counted − expected cash). A variance over the threshold requires a reason
 * (enforced in the route); any non-zero variance also posts a pending
 * `reconciliation_adjustments` row against the cash-drawer float (P1-E06), linked
 * here. All amounts are integer KES cents; variance is signed.
 */
export const posCashups = pgTable("pos_cashups", {
  id: uuid("id").defaultRandom().primaryKey(),
  cashierUserId: uuid("cashier_user_id")
    .notNull()
    .references(() => users.id),
  expectedCashCents: bigint("expected_cash_cents", { mode: "number" }).notNull(),
  expectedMpesaCents: bigint("expected_mpesa_cents", { mode: "number" }).notNull(),
  expectedPaystackCents: bigint("expected_paystack_cents", { mode: "number" }).notNull(),
  countedCashCents: bigint("counted_cash_cents", { mode: "number" }).notNull(),
  /** counted − expected cash (signed). */
  varianceCents: bigint("variance_cents", { mode: "number" }).notNull(),
  /** Required when |variance| exceeds the threshold (route-enforced). Nullable otherwise. */
  reason: text("reason"),
  /** The reconciliation adjustment posted for a non-zero variance (P1-E06). */
  reconciliationAdjustmentId: uuid("reconciliation_adjustment_id").references(
    () => reconciliationAdjustments.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PosCashupRow = typeof posCashups.$inferSelect;
export type PosCashupInsert = typeof posCashups.$inferInsert;
