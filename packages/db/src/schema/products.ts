import { bigint, boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { TaxTreatment } from "./services.js";

/**
 * `products` (P2-E04-S02) — the retail goods sold at the in-store POS: a SKU,
 * an optional barcode, a name, a price, and an on-hand stock count.
 *
 * The full catalogue (variants, suppliers, WooCommerce sync) lands in P4-E01;
 * for P2 this is the minimal POS source of truth so a cashier can scan/search a
 * product, see its price + stock, and (S03/S04) sell it. A retired product is
 * soft-deleted via `isActive = false` so receipt-line history keeps its FK.
 *
 * `priceCents` is integer minor units (KES * 100) — `bigint`, like the wallet
 * ledger and `service_prices` — so there is zero float drift. (Products carry a
 * single current price inline here rather than the effective-dated history that
 * services use; price history arrives with the P4 catalogue.) `taxTreatment`
 * mirrors `services.taxTreatment` so the cart (S03) can compute per-line tax the
 * same way for goods and services; CHECK-constrained in the migration.
 */
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Stock-keeping unit — the human/keyed code. Unique (enforced in migration). */
  sku: text("sku").notNull(),
  /** Scanned barcode (EAN/UPC). Nullable — not every product has one. Unique when present. */
  barcode: text("barcode"),
  name: text("name").notNull(),
  /** Current unit price in integer cents (KES * 100). Non-negative. */
  priceCents: bigint("price_cents", { mode: "number" }).notNull(),
  /** On-hand stock count. `<= 0` means out of stock (greyed out; sale blocked at Pay). */
  stockQty: integer("stock_qty").notNull().default(0),
  /**
   * The mapped WooCommerce product id (Story 29.5 / P4-E04-S05). NULLABLE — a
   * product with no mapping is "in-store only" and a stock push is a no-op (AC2).
   * The POS is the source of truth: this is only ever WRITTEN by an admin mapping
   * edit, never read FROM Woo into local stock.
   */
  wooProductId: bigint("woo_product_id", { mode: "number" }),
  /**
   * VAT / tax treatment (P1-E07-S04 semantics). CHECK-constrained in the
   * migration to {`vat_inclusive` | `vat_exclusive` | `vat_exempt` | `zero_rated`};
   * defaults to `vat_exempt` (KRA registration deferred).
   */
  taxTreatment: text("tax_treatment").$type<TaxTreatment>().notNull().default("vat_exempt"),
  /** Soft on/off — inactive products are not offered for sale. */
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductRow = typeof products.$inferSelect;
export type ProductInsert = typeof products.$inferInsert;
