/**
 * Nightly stock reconciliation (Story 29.5 / P4-E04-S05, AC6).
 *
 * For every MAPPED local product (`woo_product_id` set), read the local on-hand
 * stock + the Woo `stock_quantity` (via the injected client) and compare. The
 * SKUs whose local and Woo stock disagree are the DRIFT — reported worst-first
 * (largest |delta|). In-sync SKUs are omitted; unmapped products are skipped
 * entirely. The report is persisted to `wc_stock_reconciliations` and surfaced in
 * admin. Reading Woo here is for COMPARISON ONLY — local stock is never written.
 */
import { desc, isNotNull } from "drizzle-orm";
import { products, wcStockReconciliations } from "@bm/db";
import type {
  StockDriftRow,
  StockReconciliationReport,
  WooProduct,
} from "@bm/contracts";
import type { Database, Transaction, StockDriftEntry } from "@bm/db";

type Executor = Database | Transaction;

/** The slice of the Woo client the reconciliation needs (injected — no network in tests). */
export interface ReconcileClient {
  getProduct(id: number): Promise<WooProduct>;
}

export interface ReconcileStockDeps {
  client: ReconcileClient;
  /** Clock injection for a deterministic `generatedAt` in tests. */
  now?: Date;
}

/**
 * Run one reconciliation pass (AC6): compare local vs Woo stock for every mapped
 * product, persist the snapshot, and return it. The delta is `localStock - wooStock`
 * treating a null Woo `stock_quantity` (Woo not managing stock) as 0. Drift is
 * sorted worst-first by absolute delta.
 */
export async function reconcileStock(
  db: Executor,
  deps: ReconcileStockDeps,
): Promise<StockReconciliationReport> {
  const now = deps.now ?? new Date();

  const mapped = await db
    .select({
      productId: products.id,
      sku: products.sku,
      name: products.name,
      stockQty: products.stockQty,
      wooProductId: products.wooProductId,
    })
    .from(products)
    .where(isNotNull(products.wooProductId));

  const drift: StockDriftRow[] = [];
  for (const p of mapped) {
    const wooProductId = p.wooProductId!;
    const woo = await deps.client.getProduct(wooProductId);
    const wooStock = woo.stock_quantity ?? null;
    const delta = p.stockQty - (wooStock ?? 0);
    if (delta === 0) continue; // in sync — omitted (AC6)
    drift.push({
      productId: p.productId,
      sku: p.sku,
      name: p.name,
      wooProductId,
      localStock: p.stockQty,
      wooStock,
      delta,
    });
  }

  // Worst-first by absolute delta (then SKU for a deterministic tie-break).
  drift.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.sku.localeCompare(b.sku));

  await db.insert(wcStockReconciliations).values({
    generatedAt: now,
    comparedCount: mapped.length,
    drift: drift as unknown as StockDriftEntry[],
  });

  return { generatedAt: now.toISOString(), comparedCount: mapped.length, drift };
}

/** Read the newest persisted reconciliation report for the admin surface (AC6). */
export async function getLatestReconciliation(
  db: Executor,
): Promise<StockReconciliationReport | null> {
  const [row] = await db
    .select()
    .from(wcStockReconciliations)
    .orderBy(desc(wcStockReconciliations.generatedAt))
    .limit(1);
  if (!row) return null;
  return {
    generatedAt: row.generatedAt.toISOString(),
    comparedCount: row.comparedCount,
    drift: row.drift as unknown as StockDriftRow[],
  };
}
