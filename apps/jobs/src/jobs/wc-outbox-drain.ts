import { audit, type Database, type WcOutboxRow } from "@bm/db";
import {
  claimDueWcWritebacks,
  markWcWritebackDone,
  recordWcWritebackFailure,
  classifyWooError,
} from "@bm/woocommerce";
import {
  wcOrderStatusRequestSchema,
  wcStockPushRequestSchema,
} from "@bm/contracts";
import { logger as defaultLogger } from "../logger.js";
import type { Job } from "../registry.js";

/** Queue-drain workers run on the framework's default tick; 60s is plenty. */
const DEFAULT_INTERVAL_MS = 60_000;
/** AC2: bound Woo API calls to N parallel (default 4, configurable) per the story. */
const DEFAULT_CONCURRENCY = 4;
/** Rows pulled per tick (FIFO); the rest follow next tick. */
const DEFAULT_BATCH = 100;

/** The slice of the Woo client the drain needs (injected — no network in tests). */
export interface WcDrainClient {
  updateOrderStatus(id: number, status: string, note?: string): Promise<unknown>;
  updateProductStock(
    id: number,
    stockQuantity: number,
    stockStatus: "instock" | "outofstock" | "onbackorder",
  ): Promise<unknown>;
}

/** Minimal structured-logger shape the job needs. */
export interface WcOutboxDrainLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface WcOutboxDrainJobDeps {
  db: Database;
  /** The Woo client (production resolves it from the encrypted config). */
  client: WcDrainClient;
  /** Override the drain cadence (default 60s). */
  intervalMs?: number;
  /** AC2: max parallel Woo calls (default 4, configurable). */
  concurrency?: number;
  /** Rows claimed per tick (FIFO). */
  batchSize?: number;
  /** Clock injection for deterministic backoff windows in tests. */
  now?: () => Date;
  /** Structured logger for the per-run summary (AC6). */
  logger?: WcOutboxDrainLogger;
}

/** Apply one writeback to Woo. The kind selects the client call; the request is
 * validated through its contract so a malformed row fails fast (non-retryable). */
async function dispatch(client: WcDrainClient, row: WcOutboxRow): Promise<void> {
  if (row.kind === "order_status") {
    const req = wcOrderStatusRequestSchema.parse(row.request);
    await client.updateOrderStatus(req.wooOrderId, req.status, req.note);
    return;
  }
  if (row.kind === "stock_push") {
    const req = wcStockPushRequestSchema.parse(row.request);
    await client.updateProductStock(req.wooProductId, req.stockQuantity, req.stockStatus);
    return;
  }
  throw new Error(`Unknown wc_outbox kind: ${String(row.kind)}`);
}

/**
 * Run `worker` over `items` with at most `concurrency` in flight at once (a
 * simple bounded pool). Each item is awaited inside its own worker; the pool
 * resolves when every item is done. Items never reject out — the worker catches
 * its own errors (each row is isolated).
 */
async function runBounded<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx]!);
    }
  });
  await Promise.all(lanes);
}

/**
 * WooCommerce outbox drain worker (P4-E04-S07, AC2/AC3/AC6). Each tick it claims
 * due pending writebacks oldest-first (FIFO), then applies them to Woo with
 * BOUNDED CONCURRENCY (default 4). Per row:
 *   - success → `markWcWritebackDone`;
 *   - failure → classify the Woo error (network/5xx/429 = retryable, else not),
 *     and `recordWcWritebackFailure` applies the policy: retryable backs off via
 *     [1m,5m,30m,2h,6h] up to 5 attempts then dead-letters; non-retryable gets
 *     one retry then dead-letters. A dead-letter moves the row to `wc_outbox_dead`.
 * Each row is isolated (a thrown dispatch never aborts the batch). The run writes
 * ONE summary-level audit row (counts, not per-item — AC6).
 *
 * Idempotency: rows carry a stable `idempotency_key` so a re-enqueue is a no-op
 * and a retried mutation is the same logical operation (never double-applied).
 */
export function createWcOutboxDrainJob(deps: WcOutboxDrainJobDeps): Job {
  const db = deps.db;
  const now = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY;
  const batchSize = deps.batchSize ?? DEFAULT_BATCH;

  return {
    name: "wc-outbox-drain",
    intervalMs,
    cron: "* * * * *",
    onFailure: "retry-next-tick",
    run: async () => {
      const at = now();
      const due = await claimDueWcWritebacks(db, { now: at, limit: batchSize });

      let processed = 0;
      let retried = 0;
      let deadLettered = 0;

      await runBounded(due, concurrency, async (row) => {
        try {
          await dispatch(deps.client, row);
          await markWcWritebackDone(db, { id: row.id, now: at });
          processed += 1;
        } catch (err) {
          const { message, retryable } = classifyWooError(err);
          const result = await recordWcWritebackFailure(db, {
            id: row.id,
            error: message,
            retryable,
            now: at,
          });
          if (result.outcome === "dead_letter") {
            deadLettered += 1;
            log.error(
              { event: "woocommerce.writeback.dead_lettered", id: row.id, kind: row.kind, err: message },
              "woocommerce writeback dead-lettered — admin action required",
            );
          } else {
            retried += 1;
            log.warn(
              { event: "woocommerce.writeback.retry", id: row.id, kind: row.kind, attempt: result.attempts, err: message },
              "woocommerce writeback failed, scheduled for retry",
            );
          }
        }
      });

      // AC6: a single SUMMARY audit row — counts, not per-item.
      if (due.length > 0) {
        await audit(db, {
          actor: null,
          action: "woocommerce.writeback.processed",
          target: { table: "wc_outbox", id: null },
          payload: { processed, retried, dead_lettered: deadLettered, claimed: due.length },
        });
      }

      log.info(
        { event: "woocommerce.writeback.processed", processed, retried, dead_lettered: deadLettered, claimed: due.length },
        `woocommerce drain: ${processed} done, ${retried} retried, ${deadLettered} dead-lettered of ${due.length}`,
      );
    },
  };
}
