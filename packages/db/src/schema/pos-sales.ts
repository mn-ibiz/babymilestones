import { bigint, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { parents } from "./parents.js";
import { receipts } from "./receipts.js";

/** One persisted line of a POS sale (denormalised JSON on the sale row). */
export interface PosSaleLine {
  productId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  lineDiscountPct: number;
  lineTaxCents: number;
  /** What the customer pays for this line (gross). */
  lineTotalCents: number;
}

/**
 * `pos_sales` (P2-E04-S04) — the in-store sale + its payment state machine.
 *
 * A sale is created `pending`, then settled to `paid` (receipt written, stock
 * decremented) or marked `failed`. Cash + wallet settle synchronously at
 * creation; M-Pesa STK + Paystack stay `pending` until the cashier confirms the
 * payment (poll/verify) and the sale settles. The line items are stored as JSON
 * so an async sale can be settled later from the same snapshot; the authoritative
 * post-settlement line record is `receipt_lines`. `total_cents` is what the
 * customer pays (incl. VAT). Amounts are integer cents.
 */
export const posSales = pgTable("pos_sales", {
  id: uuid("id").defaultRandom().primaryKey(),
  cashierUserId: uuid("cashier_user_id")
    .notNull()
    .references(() => users.id),
  /** `cash` | `mpesa` | `paystack` | `wallet` — CHECK-constrained in the migration. */
  method: text("method").notNull(),
  /** `pending` | `paid` | `failed` | `cancelled` — CHECK-constrained in the migration. */
  status: text("status").notNull().default("pending"),
  subtotalCents: bigint("subtotal_cents", { mode: "number" }).notNull(),
  discountCents: bigint("discount_cents", { mode: "number" }).notNull(),
  taxCents: bigint("tax_cents", { mode: "number" }).notNull(),
  totalCents: bigint("total_cents", { mode: "number" }).notNull(),
  lines: jsonb("lines").$type<PosSaleLine[]>().notNull().default([]),
  /** Customer phone (M-Pesa/wallet lookup or receipt SMS). Nullable for a walk-in. */
  customerPhone: text("customer_phone"),
  /** Parent profile id when the sale was paid from a parent wallet. Nullable. */
  parentId: uuid("parent_id").references(() => parents.id),
  /** Provider handle: M-Pesa checkoutRequestId or Paystack reference. Nullable. */
  paymentRef: text("payment_ref"),
  /** Set once the sale settles and a receipt is written. */
  receiptId: uuid("receipt_id").references(() => receipts.id),
  /** Distinct failure reason for a failed sale (AC7). */
  failureReason: text("failure_reason"),
  /** Client-supplied per-attempt key — a replayed create returns the same sale. */
  idempotencyKey: text("idempotency_key"),
  /** Set when an end-of-day cash-up (S05) counts this paid sale; NULL = uncashed. */
  cashedUpAt: timestamp("cashed_up_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PosSaleRow = typeof posSales.$inferSelect;
export type PosSaleInsert = typeof posSales.$inferInsert;
