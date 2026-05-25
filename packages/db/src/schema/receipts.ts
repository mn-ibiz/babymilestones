import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { parents } from "./parents.js";
import { services } from "./services.js";

/**
 * `receipts` (P1-E08-S01) — KRA-shaped receipt header. The model is shaped for
 * eTIMS/KRA *today* so adopting eTIMS in P5 is a writer swap, not a schema
 * migration. The KRA fields (`pin`, `control_unit_number`, `cu_invoice_number`,
 * `qr_data`, `etims_status`) are all NULLABLE now: the LocalReceiptWriter
 * (P1-E08-S02) leaves them empty and a future EtimsReceiptWriter fills them.
 *
 * Money is **integer minor units (KES cents)** — `bigint`, like the wallet
 * ledger — so there is zero float drift. `total` = sum of line totals,
 * `tax_total` = sum of line tax.
 *
 * Humans see a per-series sequence like `BM-2026-000123`: `series` is the
 * namespace (e.g. `BM-2026`) and `sequence_number` is the monotonic counter
 * within it. `(series, sequence_number)` is UNIQUE (AC3); the display format is
 * `<series>-<zero-padded-sequence_number>` rendered by the writer, not stored.
 */
export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Receipt series namespace, e.g. `BM-2026`. Part of the per-series unique key. */
    series: text("series").notNull(),
    /** Monotonic counter within `series`. Unique per series (AC3). */
    sequenceNumber: bigint("sequence_number", { mode: "number" }).notNull(),
    /**
     * Optional pointer to a parent receipt — e.g. a credit-note / reversal that
     * references the original. Nullable self-FK.
     */
    parentId: uuid("parent_id"),
    /** Total, integer cents. Sum of line totals. Non-negative (CHECK in migration). */
    total: bigint("total", { mode: "number" }).notNull(),
    /** Tax total, integer cents. Sum of line tax. Non-negative (CHECK in migration). */
    taxTotal: bigint("tax_total", { mode: "number" }).notNull(),
    /** How the receipt was paid (`wallet` | `cash` | `mpesa` | ...). CHECK-free free text for now. */
    paymentMethod: text("payment_method").notNull(),
    /** Who posted the receipt (staff/role identifier). */
    postedBy: text("posted_by").notNull(),
    /** Parent the receipt belongs to (nullable — walk-in receipts have none). FK to parents. */
    parentAccountId: uuid("parent_account_id").references(() => parents.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    // --- KRA / eTIMS fields (all NULLABLE until eTIMS goes live in P5) ---
    /** KRA PIN of the taxpayer. Null until eTIMS. */
    pin: text("pin"),
    /** Control Unit number issued by the eTIMS device. Null until eTIMS. */
    controlUnitNumber: text("control_unit_number"),
    /** CU invoice number returned by eTIMS. Null until eTIMS. */
    cuInvoiceNumber: text("cu_invoice_number"),
    /** QR payload eTIMS returns for verification. Null until eTIMS. */
    qrData: text("qr_data"),
    /**
     * eTIMS submission status (nullable ENUM): `pending` | `sent` | `accepted`
     * | `rejected`. Null until eTIMS. CHECK-constrained in the migration; db has
     * no dependency on contracts so the CHECK is the runtime source of truth.
     */
    etimsStatus: text("etims_status").$type<EtimsStatus>(),
  },
  (t) => ({
    // Per-series sequence uniqueness — the humans-see-a-series guarantee (AC3).
    seriesSeqUnique: unique("receipts_series_sequence_number_key").on(
      t.series,
      t.sequenceNumber,
    ),
    parentAccountIdx: index("receipts_parent_account_id_idx").on(t.parentAccountId),
  }),
);

/** eTIMS submission status enum (P1-E08-S01 AC1). Mirrored by the migration CHECK. */
export type EtimsStatus = "pending" | "sent" | "accepted" | "rejected";

export type ReceiptRow = typeof receipts.$inferSelect;
export type ReceiptInsert = typeof receipts.$inferInsert;

/**
 * `receipt_lines` (P1-E08-S01 AC2) — one row per charged item on a receipt.
 * Exactly one of `service_id` / `product_id` is set (CHECK in migration): a line
 * charges either a catalogue service or a shop product. `unit_price`,
 * `line_tax`, `line_total` are **integer cents**. VAT per line is captured at
 * write time from the service's vatable tax treatment (the writer computes it;
 * this table just stores the result).
 */
export const receiptLines = pgTable(
  "receipt_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipts.id),
    /** Catalogue service charged (nullable — set iff product_id is null). FK to services. */
    serviceId: uuid("service_id").references(() => services.id),
    /** Shop product charged (nullable — set iff service_id is null). No products table yet, so no FK. */
    productId: uuid("product_id"),
    /** Quantity of the item. Positive (CHECK in migration). */
    quantity: integer("quantity").notNull(),
    /** Per-unit price, integer cents. Non-negative (CHECK in migration). */
    unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
    /** VAT for this line, integer cents. Non-negative (CHECK in migration). */
    lineTax: bigint("line_tax", { mode: "number" }).notNull(),
    /** Line total (qty * unit_price), integer cents. Non-negative (CHECK in migration). */
    lineTotal: bigint("line_total", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    receiptIdIdx: index("receipt_lines_receipt_id_idx").on(t.receiptId),
  }),
);

export type ReceiptLineRow = typeof receiptLines.$inferSelect;
export type ReceiptLineInsert = typeof receiptLines.$inferInsert;
