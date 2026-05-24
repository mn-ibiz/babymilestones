import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { invoices } from "./invoices.js";
import { walletLedger } from "./wallet-ledger.js";

/**
 * Linkage row tying a single `wallet_ledger` posting to the invoice it settled
 * (P1-E03-S04 AC5). One row per (ledger entry, invoice) settlement; `amount` is
 * the integer cents applied to that invoice by that ledger entry. Append-only by
 * convention — settlements are facts, never rewritten.
 */
export const walletLedgerInvoiceSettlement = pgTable(
  "wallet_ledger_invoice_settlement",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerEntryId: uuid("ledger_entry_id")
      .notNull()
      .references(() => walletLedger.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    /** Cents applied to this invoice by this ledger entry (CHECK > 0). */
    amount: bigint("amount", { mode: "number" }).notNull(),
    /**
     * `topup` (S04 FIFO settlement) | `checkin` (S05 check-in debit). Drives the
     * partial UNIQUE fence below so at most one check-in debit exists per invoice
     * (AC6) while leaving FIFO's many-row settlements unconstrained.
     */
    kind: text("kind").notNull().default("topup"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    invoiceIdIdx: index("wallet_ledger_invoice_settlement_invoice_id_idx").on(t.invoiceId),
    ledgerEntryIdIdx: index("wallet_ledger_invoice_settlement_ledger_entry_id_idx").on(
      t.ledgerEntryId,
    ),
    // P1-E03-S05 AC6: one check-in debit per invoice. Partial index — only
    // `checkin` rows are fenced.
    checkinUniq: uniqueIndex("wallet_ledger_invoice_settlement_checkin_uniq")
      .on(t.invoiceId)
      .where(sql`${t.kind} = 'checkin'`),
  }),
);

export type WalletLedgerInvoiceSettlementRow =
  typeof walletLedgerInvoiceSettlement.$inferSelect;
export type WalletLedgerInvoiceSettlementInsert =
  typeof walletLedgerInvoiceSettlement.$inferInsert;
