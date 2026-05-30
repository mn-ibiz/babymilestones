import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { wallets } from "./wallets.js";
import { walletLedger } from "./wallet-ledger.js";

/**
 * Append-only loyalty points ledger (P2-E05-S01). One row per loyalty movement.
 *
 * - `direction` is `earn` | `redeem`; `points` is always a positive integer.
 * - Balance is DERIVED (SUM earn - SUM redeem) — there is no mutable cached
 *   points column that could drift.
 * - `rateSnapshot` records the earn/redeem rate (KES per point) in force when
 *   the row was written, so a later rate change never rewrites historical points
 *   (AC3).
 * - `walletLedgerEntryId` links the wallet_ledger movement that triggered this
 *   row (AC2): the settled topup/debit for an earn, or the redemption credit for
 *   a redeem.
 * - `seq` (BIGSERIAL) provides a strict monotonic order for newest-first reads.
 *
 * Append-only by convention: the only write path is INSERT (idempotent on
 * `idempotencyKey`).
 */
export const loyaltyLedger = pgTable(
  "loyalty_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    direction: text("direction").notNull(),
    points: integer("points").notNull(),
    rateSnapshot: integer("rate_snapshot").notNull(),
    walletLedgerEntryId: uuid("wallet_ledger_entry_id").references(
      () => walletLedger.id,
    ),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    walletIdx: index("loyalty_ledger_wallet_id_idx").on(t.walletId),
    walletSeqIdx: index("loyalty_ledger_wallet_seq_idx").on(t.walletId, t.seq),
  }),
);

export type LoyaltyLedgerRow = typeof loyaltyLedger.$inferSelect;
export type LoyaltyLedgerInsert = typeof loyaltyLedger.$inferInsert;
