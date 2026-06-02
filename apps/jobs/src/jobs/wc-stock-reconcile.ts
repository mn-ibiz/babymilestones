import { audit, type Database } from "@bm/db";
import { reconcileStock, type ReconcileClient } from "@bm/woocommerce";
import { logger as defaultLogger } from "../logger.js";
import type { Job } from "../registry.js";

/** AC6: nightly cadence — run once a day at midnight (configurable via `intervalMs`). */
const DEFAULT_INTERVAL_MS = 24 * 60 * 60_000;

/** Minimal structured-logger shape the job needs (the shared jobs logger fits). */
export interface WcStockReconcileLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface WcStockReconcileJobDeps {
  db: Database;
  /** The Woo client (production resolves it from the encrypted config). */
  client: ReconcileClient;
  /** Override the cadence (default 24h — AC6). */
  intervalMs?: number;
  /** Clock injection for a deterministic `generatedAt` in tests. */
  now?: () => Date;
  /** Structured logger for the per-run summary. */
  logger?: WcStockReconcileLogger;
}

/**
 * Nightly stock-reconciliation job (P4-E04-S05, AC6). Each run compares local vs
 * Woo stock for every MAPPED product, persists the drift report to
 * `wc_stock_reconciliations` (surfaced in admin), and writes ONE summary audit row
 * (compared + drifted counts — not per-item). Reading Woo here is for COMPARISON
 * only — local stock is never written back (the POS is the source of truth).
 *
 * A `getProduct` throw propagates (so the framework records the failed run +
 * alerts) WITHOUT persisting a partial report — the failure is surfaced.
 */
export function createWcStockReconcileJob(deps: WcStockReconcileJobDeps): Job {
  const db = deps.db;
  const now = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;

  return {
    name: "wc-stock-reconcile",
    intervalMs,
    cron: "0 0 * * *",
    onFailure: "retry-next-tick",
    run: async () => {
      const at = now();
      const report = await reconcileStock(db, { client: deps.client, now: at });

      // AC6: a single SUMMARY audit row — counts, not per-item.
      await audit(db, {
        actor: null,
        action: "woocommerce.stock.reconciled",
        target: { table: "wc_stock_reconciliations", id: null },
        payload: { compared: report.comparedCount, drifted: report.drift.length },
      });

      log.info(
        { event: "woocommerce.stock.reconciled", compared: report.comparedCount, drifted: report.drift.length },
        `woocommerce reconciliation: ${report.drift.length} drifted of ${report.comparedCount} mapped`,
      );
    },
  };
}
