import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { parents } from "./parents.js";

/**
 * Outstanding invoices owed by a parent (P1-E03-S04). An invoice is an amount
 * the parent owes (e.g. a check-in debit beyond the wallet balance). FIFO
 * settlement clears the oldest `created_at` first (AC1); `amountDue` is reduced
 * on partial settlement (AC3) and reaches 0 when the invoice closes.
 *
 * Money is integer minor units (KES cents), `bigint`, never negative. Status is
 * `pending` until fully cleared, then `settled`.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id),
    /** Remaining amount owed, integer cents (CHECK >= 0 in the migration). */
    amountDue: bigint("amount_due", { mode: "number" }).notNull(),
    /** `pending` | `settled` — CHECK-constrained in the migration. */
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // FIFO scan: outstanding invoices for a parent, oldest first.
    parentIdCreatedAtIdx: index("invoices_parent_id_created_at_idx").on(
      t.parentId,
      t.createdAt,
    ),
  }),
);

export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceInsert = typeof invoices.$inferInsert;
