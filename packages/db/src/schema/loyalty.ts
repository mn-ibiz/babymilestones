import {
  type AnyPgColumn,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { wallets } from "./wallets.js";
import { walletLedger } from "./wallet-ledger.js";
import { users } from "./users.js";

/**
 * Append-only loyalty points ledger — merged P2-E05 + P3-E04 schema.
 *
 * P2-E05 (Epic 20) columns: walletId, direction, points, rateSnapshot,
 * walletLedgerEntryId, sourceType, sourceId, idempotencyKey, metadata, seq.
 * P3-E04 (Epic 26) additions: parentId, pointsDelta, kind, postedBy, reason,
 * reversesLoyaltyLedgerId, sourceWalletLedgerId, earnRate, earnedAmountMinor,
 * negativeCarry, appliedToNegativeCarry, pendingClawback.
 *
 * Rows written by the P2-E05 engine leave P3-E04 columns null; rows written by
 * the P3-E04 engine leave P2-E05 columns null. Balance functions choose the
 * correct column based on which API they serve.
 */
export const loyaltyLedger = pgTable(
  "loyalty_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // P2-E05 — strict monotonic ordering for newest-first history.
    seq: bigserial("seq", { mode: "number" }).notNull(),
    // P2-E05 — wallet owner reference.
    walletId: uuid("wallet_id").references(() => wallets.id),
    direction: text("direction"),
    points: integer("points"),
    rateSnapshot: integer("rate_snapshot"),
    walletLedgerEntryId: uuid("wallet_ledger_entry_id").references(
      () => walletLedger.id,
    ),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    idempotencyKey: text("idempotency_key").unique(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    // P3-E04 — parent (user) owner reference.
    parentId: uuid("parent_id").references(() => users.id),
    pointsDelta: integer("points_delta"),
    kind: text("kind"),
    postedBy: text("posted_by"),
    reason: text("reason"),
    reversesLoyaltyLedgerId: uuid("reverses_loyalty_ledger_id").references(
      (): AnyPgColumn => loyaltyLedger.id,
    ),
    sourceWalletLedgerId: uuid("source_wallet_ledger_id").references(
      () => walletLedger.id,
    ),
    earnRate: numeric("earn_rate"),
    earnedAmountMinor: integer("earned_amount_minor"),
    // Shared (P3-E04, added by migrations 0084/0085).
    negativeCarry: boolean("negative_carry").notNull().default(false),
    appliedToNegativeCarry: integer("applied_to_negative_carry").notNull().default(0),
    pendingClawback: integer("pending_clawback").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    walletIdx: index("loyalty_ledger_wallet_id_idx").on(t.walletId),
    walletSeqIdx: index("loyalty_ledger_wallet_seq_idx").on(t.walletId, t.seq),
    parentIdIdx: index("loyalty_ledger_parent_id_idx").on(t.parentId),
    reversesIdx: index("loyalty_ledger_reverses_idx").on(t.reversesLoyaltyLedgerId),
    sourceWalletIdx: index("loyalty_ledger_source_wallet_idx").on(t.sourceWalletLedgerId),
  }),
);

export type LoyaltyLedgerRow = typeof loyaltyLedger.$inferSelect;
export type LoyaltyLedgerInsert = typeof loyaltyLedger.$inferInsert;
