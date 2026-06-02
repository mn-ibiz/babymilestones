import { audit, type Database } from "@bm/db";
import { advanceCheckpoint, getSyncState, upsertWcOrder } from "@bm/woocommerce";
import type { WooOrder } from "@bm/contracts";
import { logger as defaultLogger } from "../logger.js";
import type { Job } from "../registry.js";

/** AC1: default cadence — pull every 2 minutes (configurable via `intervalMs`). */
const DEFAULT_INTERVAL_MS = 120_000;
/** Pagination guard: never loop forever if Woo keeps returning a full page. */
const MAX_PAGES = 50;

/** The slice of the Woo client the pull needs (injected — no network in tests). */
export interface WcPullClient {
  listOrders(opts?: { since?: string; page?: number }): Promise<WooOrder[]>;
}

/** Minimal structured-logger shape the job needs (the shared jobs logger fits). */
export interface WcSyncPullLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface WcSyncPullJobDeps {
  db: Database;
  /** The Woo client (production resolves it from the encrypted config). */
  client: WcPullClient;
  /** Override the pull cadence (default 2 min — AC1). */
  intervalMs?: number;
  /** Clock injection for deterministic checkpoints in tests. */
  now?: () => Date;
  /** Structured logger for the per-run summary (AC6). */
  logger?: WcSyncPullLogger;
}

/** Parse a Woo `date_modified` string into a Date, or null when absent/invalid. */
function parseModified(s: string | undefined): Date | null {
  if (!s) return null;
  // Woo emits naive site-local ISO (`2026-06-02T11:30:00`) on `date_modified`;
  // `date_modified_gmt` is the UTC sibling. We treat the value as UTC for the
  // checkpoint (the client maps `since` straight back to `modified_after`), which
  // is internally consistent: what we store is exactly what we send next time.
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * WooCommerce order pull cycle (P4-E04-S07, AC1/AC6). Each tick:
 *   1. read the singleton checkpoint;
 *   2. `listOrders({ since: last_sync_at })`, paging until a short/empty page;
 *   3. idempotently upsert each order into `wc_orders` (re-running never dupes);
 *   4. advance the checkpoint to the newest `date_modified` seen + stamp the pull
 *      completion (a pull that returns nothing still stamps `last_pull_at`);
 *   5. write ONE summary-level audit row (counts, not per-item — AC6).
 *
 * A `listOrders` throw propagates (so the framework records the failed run +
 * alerts, and the >15-min banner eventually fires) WITHOUT advancing the
 * checkpoint or auditing — the failure is surfaced, never silently swallowed.
 */
export function createWcSyncPullJob(deps: WcSyncPullJobDeps): Job {
  const db = deps.db;
  const now = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;

  return {
    name: "wc-sync-pull",
    intervalMs,
    cron: "*/2 * * * *",
    onFailure: "retry-next-tick",
    run: async () => {
      const at = now();
      const state = await getSyncState(db);
      const since = state.lastSyncAt ? state.lastSyncAt.toISOString() : undefined;

      let pulled = 0;
      let newest: Date | null = null;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const orders = await deps.client.listOrders({ since, page });
        if (orders.length === 0) break;
        for (const o of orders) {
          await upsertWcOrder(db, o);
          pulled += 1;
          const mod = parseModified(o.date_modified);
          if (mod && (!newest || mod > newest)) newest = mod;
        }
        // A short page means we have reached the tail — stop paging.
        if (orders.length < 1) break;
        if (orders.length < 10) break; // Woo's default per_page is 10; a partial page is the last.
      }

      // Advance the checkpoint (never backwards) and stamp the completion.
      await advanceCheckpoint(db, { lastSyncAt: newest, now: at });

      // AC6: a single SUMMARY audit row — the pulled count, not per-item.
      await audit(db, {
        actor: null,
        action: "woocommerce.sync.pulled",
        target: { table: "wc_orders", id: null },
        payload: {
          count: pulled,
          since: since ?? null,
          checkpoint: newest ? newest.toISOString() : (state.lastSyncAt?.toISOString() ?? null),
        },
      });

      log.info(
        { event: "woocommerce.sync.pulled", pulled, since: since ?? null },
        `woocommerce pull: ${pulled} orders upserted`,
      );
    },
  };
}
