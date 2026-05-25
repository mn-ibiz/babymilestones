import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * Bank transfer pending notification (P1-E04-S07). One row per bank transfer an
 * admin records manually (or a future bank API ingests), awaiting a match to a
 * parent and confirmation. Domain table — unprefixed.
 *
 * State machine: `pending → confirmed`. On confirm an admin (or treasury) matches
 * the transfer to a parent and credits their wallet via `@bm/wallet` using THIS
 * row's `id` as the wallet idempotency key — so a double-confirm cannot
 * double-credit (the ledger `idempotency_key` UNIQUE is the second layer).
 *
 * `parent_id` is nullable until the transfer is matched. Money is integer minor
 * units (KES cents), bigint, positive.
 */
export const bankTransferPending = pgTable(
  "bank_transfer_pending",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Amount received, integer minor units (KES cents). Positive. */
    amount: bigint("amount", { mode: "number" }).notNull(),
    /** Bank reference / narration captured from the transfer (free text). */
    reference: text("reference").notNull(),
    /** Matched parent (users.id). NULL until an admin matches the transfer. */
    parentId: uuid("parent_id").references(() => users.id),
    /** `pending` (recorded, unmatched/unconfirmed) | `confirmed` (credited). */
    status: text("status").notNull().default("pending"),
    /** Admin/treasury user id that confirmed the credit. NULL while pending. */
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusCreatedAtIdx: index("bank_transfer_pending_status_created_at_idx").on(
      t.status,
      t.createdAt,
    ),
  }),
);

export type BankTransferPendingRow = typeof bankTransferPending.$inferSelect;
export type BankTransferPendingInsert = typeof bankTransferPending.$inferInsert;
