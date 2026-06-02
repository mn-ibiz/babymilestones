/**
 * Non-POS stock-mutation paths (Story 29.5 / P4-E04-S05, AC1).
 *
 * The POS sale decrement lives in the payment route (it already enqueues a push).
 * The OTHER stock-mutating events flow through {@link adjustStock}:
 *   - goods-received / restock  → a positive `delta`;
 *   - stock-take                → an absolute `setTo`;
 *   - manual admin adjustment   → a signed `delta`.
 *
 * Each updates LOCAL stock (the source of truth, clamped at zero — never
 * negative), writes ONE audit row inside the transaction, and enqueues a
 * coalesced Woo stock push (a no-op for an unmapped "in-store only" product —
 * AC2). Online-order fulfilment is NOT here: Woo already deducted it and the
 * reconciliation report (AC6) covers drift — we never auto-deduct local stock for
 * an incoming online order.
 */
import { audit, products, type Database, type ProductRow, type Transaction } from "@bm/db";
import { enqueueStockPush } from "@bm/woocommerce";
import { eq } from "drizzle-orm";

type Executor = Database | Transaction;

/** Why the stock changed — recorded on the audit row (AC1). */
export type StockAdjustmentReason = "goods_received" | "stock_take" | "manual";

export interface AdjustStockInput {
  productId: string;
  reason: StockAdjustmentReason;
  /** Signed change to apply (goods-received / manual). Mutually exclusive with `setTo`. */
  delta?: number;
  /** Absolute target quantity (stock-take). Mutually exclusive with `delta`. */
  setTo?: number;
  /** Acting staffer's user id (audited). */
  actorUserId: string;
  /** Optional free-text note recorded on the audit row. */
  note?: string;
}

/**
 * Apply a non-POS stock adjustment (AC1). Runs in a transaction so the stock
 * update, the audit row and the push enqueue commit together. Returns the updated
 * product, or null when the product does not exist. The new on-hand quantity is
 * clamped at zero (stock never goes negative); the push carries that value and
 * the derived `stock_status`.
 */
export async function adjustStock(
  db: Executor,
  input: AdjustStockInput,
): Promise<ProductRow | null> {
  const run = async (tx: Executor): Promise<ProductRow | null> => {
    const [current] = await tx.select().from(products).where(eq(products.id, input.productId));
    if (!current) return null;

    const next =
      input.setTo !== undefined ? input.setTo : current.stockQty + (input.delta ?? 0);
    const clamped = Math.max(0, next);

    const [updated] = await tx
      .update(products)
      .set({ stockQty: clamped, updatedAt: new Date() })
      .where(eq(products.id, input.productId))
      .returning();

    await audit(tx, {
      actor: input.actorUserId,
      action: "stock.adjusted",
      target: { table: "products", id: input.productId },
      payload: {
        reason: input.reason,
        from: current.stockQty,
        to: clamped,
        ...(input.delta !== undefined ? { delta: input.delta } : {}),
        ...(input.setTo !== undefined ? { set_to: input.setTo } : {}),
        ...(input.note ? { note: input.note } : {}),
      },
    });

    // Enqueue a coalesced Woo stock push (no-op when the product is unmapped).
    await enqueueStockPush(tx, { productId: input.productId });

    return updated!;
  };

  if (typeof (db as Database).transaction === "function") {
    return (db as Database).transaction((tx) => run(tx as unknown as Executor));
  }
  return run(db);
}
