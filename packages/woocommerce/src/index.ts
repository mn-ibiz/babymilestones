/**
 * @bm/woocommerce — a single typed WooCommerce REST API client (P4-E04-S06 /
 * Story 29.6) so all sync work (S07+) talks to one configured surface.
 *
 * - `createWooClient`: HTTP Basic over HTTPS (enforced), injected transport,
 *   Zod-validated responses, typed errors, one attempt per call (NO retry).
 * - typed errors: `WooNotFound`, `WooRateLimited`, `WooAuthFailed`,
 *   `WooServerError`, `WooNetworkError` (+ `WooConfigError`, `WooError` base).
 * - `wooConfig` persistence: encrypted-at-rest credential storage for the admin
 *   "WooCommerce" settings panel; the secret is write-only (never returned).
 */
export const PACKAGE = "@bm/woocommerce" as const;

export { createWooClient } from "./client.js";
export type {
  WooClient,
  WooConfig,
  WooTransport,
  WooLog,
  WooLogEntry,
  CreateWooClientOptions,
  ListOrdersOptions,
  ListProductsOptions,
} from "./client.js";

export {
  WooError,
  WooConfigError,
  WooNotFound,
  WooRateLimited,
  WooAuthFailed,
  WooServerError,
  WooNetworkError,
} from "./errors.js";

export {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
} from "./crypto.js";

export {
  saveWooConfig,
  getWooConfig,
  getWooConfigPublic,
  resolveWooClientConfig,
} from "./config.js";
export type { WooConfigExecutor } from "./config.js";

// Sync state machine + helpers (Story 29.7 / P4-E04-S07).
export {
  WC_BACKOFF_MS,
  WC_MAX_ATTEMPTS,
  WC_NON_RETRYABLE_MAX_ATTEMPTS,
  wcBackoffMs,
  getSyncState,
  advanceCheckpoint,
  upsertWcOrder,
  enqueueWcWriteback,
  claimDueWcWritebacks,
  markWcWritebackDone,
  recordWcWritebackFailure,
  listWcDeadLetters,
  countWcDeadLetters,
  countWcQueueDepth,
  replayWcDeadLetter,
  resolveWcDeadLetter,
  discardWcDeadLetter,
} from "./sync.js";
export type {
  PulledOrder,
  AdvanceCheckpointInput,
  EnqueueWcWritebackInput,
  ClaimDueInput,
  RecordFailureInput,
  RecordFailureResult,
} from "./sync.js";
export { classifyWooError, isRetryableWooError } from "./retry.js";
export { computeSyncHealth, SYNC_STALE_MS, recentSyncErrors } from "./health.js";
export type { ComputeSyncHealthDeps } from "./health.js";

// POS "Online orders" mirror read (Story 29.1 / P4-E04-S01).
export { listOnlineOrders } from "./online-orders.js";

// Order-status transition write path (Story 29.2 / P4-E04-S02).
export { applyOrderTransition, transitionOutboxKey } from "./order-transitions.js";
export type {
  ApplyOrderTransitionInput,
  ApplyOrderTransitionResult,
  ApplyOrderTransitionReason,
} from "./order-transitions.js";

// Stock push: POS catalogue stock changes propagate to Woo (Story 29.5 / P4-E04-S05).
export { enqueueStockPush, STOCK_PUSH_DEBOUNCE_MS } from "./stock-push.js";
export type { EnqueueStockPushInput } from "./stock-push.js";
export { listSkuMappings, updateSkuMapping, applySkuMappingCsv } from "./sku-mapping.js";
export type { UpdateSkuMappingInput, ApplySkuMappingCsvResult } from "./sku-mapping.js";
export { reconcileStock, getLatestReconciliation } from "./reconciliation.js";
export type { ReconcileClient, ReconcileStockDeps } from "./reconciliation.js";
