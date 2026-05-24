import { bigint, index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    invoiceIdIdx: index("wallet_ledger_invoice_settlement_invoice_id_idx").on(t.invoiceId),
    ledgerEntryIdIdx: index("wallet_ledger_invoice_settlement_ledger_entry_id_idx").on(
      t.ledgerEntryId,
    ),
  }),
);

export type WalletLedgerInvoiceSettlementRow =
  typeof walletLedgerInvoiceSettlement.$inferSelect;
export type WalletLedgerInvoiceSettlementInsert =
  typeof walletLedgerInvoiceSettlement.$inferInsert;
