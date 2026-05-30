import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { walletLedger } from "./wallet-ledger.js";

/**
 * Append-only `loyalty_ledger` (P3-E04 — Loyalty Engine: clawback + negative
 * carry). The immutable spine of the loyalty-points system: every points
 * movement is one row; rows are NEVER updated or deleted. A balance is always
 * `SUM(points_delta)` over the parent's rows — credits positive, debits
 * negative — so it can never drift from the postings.
 *
 * Points are **integer** (no fractional points, no float drift). Money snapshots
 * (`earn_rate`, `earned_amount_minor`) are kept only for traceability of how an
 * earn entry's points were computed, so a later proportional clawback can be
 * recomputed deterministically.
 *
 * A *clawback* (P3-E04-S01) is a NEW negative entry, never a mutation of the
 * original earn — `kind='clawback'`, `reverses_loyalty_ledger_id` pointing at
 * the earn it (partly) reverses. When the clawback drives the balance below
 * zero, `negative_carry=true` records the honest negative carry; future earns
 * (S02) repay it first via `applied_to_negative_carry`.
 *
 * NOTE: in the canonical product this table is created by the P2-E05 loyalty
 * engine; that engine is not present in this branch, so this Epic-26 migration
 * also bootstraps the minimal ledger + earn primitive the four stories build on.
 */
export const loyaltyLedger = pgTable(
  "loyalty_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** The parent (user id) whose points balance this row moves. */
    parentId: uuid("parent_id")
      .notNull()
      .references(() => users.id),
    /** Signed integer points. Positive = credit (earn/adjust), negative = debit. */
    pointsDelta: integer("points_delta").notNull(),
    /** `earn` | `redeem` | `clawback` | `adjustment` — CHECK-constrained in the migration. */
    kind: text("kind").notNull(),
    /** User id (or system actor) that posted the entry. */
    postedBy: text("posted_by").notNull(),
    /** Free-text reason (required for `adjustment`; nullable otherwise). */
    reason: text("reason"),
    /**
     * Self-FK: for a `clawback`, the earn `loyalty_ledger` row being reversed.
     * Nullable for every other kind.
     */
    reversesLoyaltyLedgerId: uuid("reverses_loyalty_ledger_id").references(
      (): AnyPgColumn => loyaltyLedger.id,
    ),
    /**
     * Link to the `wallet_ledger` movement that triggered this row: the original
     * spend for an `earn`, or the `refund` entry for a `clawback`. Nullable for
     * manual adjustments.
     */
    sourceWalletLedgerId: uuid("source_wallet_ledger_id").references(
      () => walletLedger.id,
    ),
    /** Earn-rate snapshot (points per KES 100) on the day the earn posted. */
    earnRate: numeric("earn_rate"),
    /** The spent amount (minor units) that this earn was computed from. */
    earnedAmountMinor: integer("earned_amount_minor"),
    /** True on a clawback that drove the balance below zero (honest negative carry). */
    negativeCarry: boolean("negative_carry").notNull().default(false),
    /** Portion of an earn applied to repay a pre-existing negative carry (S02). */
    appliedToNegativeCarry: integer("applied_to_negative_carry").notNull().default(0),
    /**
     * Points provisionally pending clawback (S04): set on an earn whose source
     * spend has a refund initiated-but-not-finalised, so redemption excludes
     * them. 0 for a fully-settled entry. Append-only model: a finalised clawback
     * posts a real negative row and the originating earn's pending is cleared by
     * a follow-up settlement row (see loyalty-redemption availableToRedeem).
     */
    pendingClawback: integer("pending_clawback").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parentIdIdx: index("loyalty_ledger_parent_id_idx").on(t.parentId),
    reversesIdx: index("loyalty_ledger_reverses_idx").on(t.reversesLoyaltyLedgerId),
    sourceWalletIdx: index("loyalty_ledger_source_wallet_idx").on(t.sourceWalletLedgerId),
    parentCreatedIdx: index("loyalty_ledger_parent_created_idx").on(
      t.parentId,
      sql`${t.createdAt} DESC`,
    ),
  }),
);

export type LoyaltyLedgerRow = typeof loyaltyLedger.$inferSelect;
export type LoyaltyLedgerInsert = typeof loyaltyLedger.$inferInsert;
