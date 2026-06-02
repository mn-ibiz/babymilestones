/**
 * Stock-push write path (Story 29.5 / P4-E04-S05).
 *
 * Every stock-mutating event in the custom system (in-store POS sale, goods
 * received, stock-take, manual admin adjustment) calls {@link enqueueStockPush}
 * with the local product id. The POS is the source of truth: the helper reads the
 * CURRENT local stock + the product's `woo_product_id` mapping, derives the Woo
 * `stock_status` (AC3), and enqueues a `stock_push` writeback — drained, retried
 * and dead-lettered by the Story 29.7 worker (this module never touches Woo).
 *
 * DEBOUNCE / COALESCE (AC4): the outbox row is keyed by the LOCAL PRODUCT id
 * (`wc-stock:{productId}`). A burst of mutations therefore re-arms ONE pending
 * row rather than enqueuing N rows — each call OVERWRITES the request with the
 * latest (final) value and pushes `next_attempt_at` to `now + debounce`, so a
 * settled burst collapses to a single API call carrying the final stock. (The
 * row is only claimed once it is due, after the burst quiets — see the drain's
 * `claimDueWcWritebacks`.) An unmapped product (no `woo_product_id`) is "in-store
 * only" and the push is a NO-OP (AC2).
 */
import { eq } from "drizzle-orm";
import { products, wcOutbox, type WcOutboxRow } from "@bm/db";
import {
  stockPushOutboxKey,
  stockStatusFor,
  STOCK_PUSH_DEBOUNCE_MS,
  type WcStockPushRequest,
} from "@bm/contracts";
import type { Database, Transaction } from "@bm/db";

type Executor = Database | Transaction;

export { STOCK_PUSH_DEBOUNCE_MS } from "@bm/contracts";

export interface EnqueueStockPushInput {
  /** The local product whose stock just changed. */
  productId: string;
  /** Per-SKU debounce window in ms (default {@link STOCK_PUSH_DEBOUNCE_MS}). */
  debounceMs?: number;
  /** Clock (defaults to now). */
  now?: Date;
}

/**
 * Enqueue (or re-arm) a coalesced stock push for one product (AC1/AC3/AC4).
 *
 * Reads the current local stock + mapping, then:
 *   - unmapped product → returns null (NO-OP, AC2);
 *   - mapped → upserts the single `wc-stock:{productId}` outbox row with the
 *     latest `{ wooProductId, stockQuantity, stockStatus }` and a `next_attempt_at`
 *     of `now + debounce` (re-arming any existing pending row — AC4).
 *
 * Returns the pending outbox row, or null when the push was a no-op. Idempotent
 * by the per-product key: a second call within the window updates the same row.
 */
export async function enqueueStockPush(
  db: Executor,
  input: EnqueueStockPushInput,
): Promise<WcOutboxRow | null> {
  const now = input.now ?? new Date();
  const debounceMs = input.debounceMs ?? STOCK_PUSH_DEBOUNCE_MS;

  const [product] = await db
    .select({ id: products.id, stockQty: products.stockQty, wooProductId: products.wooProductId })
    .from(products)
    .where(eq(products.id, input.productId));

  // Unknown product, or "in-store only" (no Woo mapping) → push is a no-op (AC2).
  if (!product || product.wooProductId == null) return null;

  const request: WcStockPushRequest = {
    wooProductId: product.wooProductId,
    stockQuantity: product.stockQty,
    stockStatus: stockStatusFor(product.stockQty),
  };
  const idempotencyKey = stockPushOutboxKey(product.id);
  const nextAttemptAt = new Date(now.getTime() + debounceMs);

  // Upsert the single per-product row. On INSERT this arms a fresh push; on
  // CONFLICT (a pending push already exists for this product) we OVERWRITE the
  // request with the latest value AND re-arm the window — collapsing the burst to
  // ONE final-value push. Re-set status/attempts so a previously-failed (backing
  // off) row is brought back to a clean, debounced state on the new mutation.
  const [row] = await db
    .insert(wcOutbox)
    .values({
      idempotencyKey,
      kind: "stock_push",
      request: request as unknown as Record<string, unknown>,
      status: "pending",
      attempts: 0,
      nextAttemptAt,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: wcOutbox.idempotencyKey,
      set: {
        request: request as unknown as Record<string, unknown>,
        status: "pending",
        attempts: 0,
        nextAttemptAt,
        lastError: null,
        doneAt: null,
      },
    })
    .returning();

  return row!;
}
