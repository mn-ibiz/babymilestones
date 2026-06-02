import { bigint, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * WooCommerce sync scheduler + dead-letter tables (P4-E04-S07 / Story 29.7).
 *
 *   wc_sync_state    — singleton checkpoint (last_sync_at drives the next pull's
 *                      `modified_after`; last_pull_at drives the >15-min banner).
 *   wc_orders        — local projection of pulled orders, idempotent upsert on
 *                      the Woo order id (AC1).
 *   wc_outbox        — pending writebacks (order-status updates [S02] + stock
 *                      pushes [S05]) drained FIFO with bounded concurrency (AC2);
 *                      retried with exponential backoff and dead-lettered on
 *                      exhaustion (AC3).
 *   wc_outbox_dead   — dead-lettered writebacks retaining the request + last
 *                      error + timestamps for admin replay/resolve/discard (AC4).
 */

/** Checkpoint singleton — enforced by `wc_sync_state_singleton_idx` (migration 0092). */
export const wcSyncState = pgTable("wc_sync_state", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Newest order modification pulled; next pull asks `modified_after = last_sync_at`. */
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  /** When the most recent pull cycle completed (drives the staleness banner — AC5). */
  lastPullAt: timestamp("last_pull_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WcSyncStateRow = typeof wcSyncState.$inferSelect;
export type WcSyncStateInsert = typeof wcSyncState.$inferInsert;

/**
 * The POS in-store fulfilment workflow status (Story 29.1 / P4-E04-S01). Distinct
 * from the Woo-sourced `status`: this column is OWNED by the POS — set to `new`
 * once on insert and never overwritten by a re-pull. Mapped to Woo statuses on
 * writeback (S02).
 */
export type WcOrderLocalStatus =
  | "new"
  | "packing"
  | "ready"
  | "dispatched"
  | "fulfilled"
  | "cancelled";

/** Local projection of a pulled WooCommerce order; UNIQUE on `woo_order_id` (AC1). */
export const wcOrders = pgTable(
  "wc_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** The WooCommerce order id — UNIQUE so the pull upsert is idempotent. */
    wooOrderId: bigint("woo_order_id", { mode: "number" }).notNull(),
    status: text("status").notNull(),
    number: text("number"),
    total: text("total"),
    currency: text("currency"),
    dateCreated: text("date_created"),
    /** Woo's `date_modified`; drives the checkpoint advance. */
    dateModified: text("date_modified"),
    /** Full pulled payload for downstream tabs (S01) without a refetch. */
    payload: jsonb("payload").notNull().default({}).$type<Record<string, unknown>>(),
    /**
     * POS workflow status (Story 29.1). NOT NULL DEFAULT 'new'; the pull sets it on
     * INSERT only and NEVER overwrites it on UPDATE — the POS owns this column.
     */
    localStatus: text("local_status")
      .notNull()
      .default("new")
      .$type<WcOrderLocalStatus>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    wooOrderIdIdx: index("wc_orders_woo_order_id_idx").on(t.wooOrderId),
    localStatusIdx: index("wc_orders_local_status_idx").on(t.localStatus),
  }),
);

export type WcOrderRow = typeof wcOrders.$inferSelect;
export type WcOrderInsert = typeof wcOrders.$inferInsert;

/** A pending writeback kind: an order-status update (S02) or a stock push (S05). */
export type WcOutboxKind = "order_status" | "stock_push";
/** Outbox row status: `pending` (due/backing off) or `done` (applied). */
export type WcOutboxStatus = "pending" | "done";

/** Pending writebacks drained FIFO with bounded concurrency (AC2/AC3). */
export const wcOutbox = pgTable(
  "wc_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Stable per-operation key — UNIQUE so a retry never double-applies (idempotency). */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    kind: text("kind").notNull().$type<WcOutboxKind>(),
    /** The full writeback request (order-status update or stock push). */
    request: jsonb("request").notNull().default({}).$type<Record<string, unknown>>(),
    status: text("status").notNull().default("pending").$type<WcOutboxStatus>(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    drainIdx: index("wc_outbox_drain_idx").on(t.status, t.nextAttemptAt, t.createdAt),
  }),
);

export type WcOutboxRow = typeof wcOutbox.$inferSelect;
export type WcOutboxInsert = typeof wcOutbox.$inferInsert;

/** Dead-letter row status: awaiting action / manually resolved / discarded (AC4). */
export type WcOutboxDeadStatus = "dead" | "resolved" | "discarded";

/** Dead-lettered writebacks for admin replay / resolve / discard (AC4). */
export const wcOutboxDead = pgTable(
  "wc_outbox_dead",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    kind: text("kind").notNull().$type<WcOutboxKind>(),
    /** The original request, retained so a replay re-enqueues it verbatim. */
    request: jsonb("request").notNull().default({}).$type<Record<string, unknown>>(),
    status: text("status").notNull().default("dead").$type<WcOutboxDeadStatus>(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    discardedAt: timestamp("discarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("wc_outbox_dead_status_idx").on(t.status, t.deadLetteredAt),
  }),
);

export type WcOutboxDeadRow = typeof wcOutboxDead.$inferSelect;
export type WcOutboxDeadInsert = typeof wcOutboxDead.$inferInsert;

/**
 * The classification of one local order-status transition (Story 29.2): a forward
 * step up the ladder, a cancel, or an admin reversal to an earlier status (AC4).
 */
export type OrderEventKind = "forward" | "cancel" | "reversal";

/**
 * Audit-grade local order-status transition log (Story 29.2 / P4-E04-S02). One
 * row per POS workflow transition on a WooCommerce order — the durable record of
 * who moved the order from/to which status, when, and (for a dispatch) the rider /
 * vehicle / contact / time metadata (AC5). Written BEFORE the Woo writeback is
 * enqueued; it stands regardless of whether the writeback ever succeeds (AC6).
 */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** The WooCommerce order id this event concerns. */
    wooOrderId: bigint("woo_order_id", { mode: "number" }).notNull(),
    /** The local workflow status moved FROM (the POS vocabulary). */
    fromStatus: text("from_status").notNull().$type<WcOrderLocalStatus>(),
    /** The local workflow status moved TO. */
    toStatus: text("to_status").notNull().$type<WcOrderLocalStatus>(),
    /** The acting staffer's user id (null only for a system actor). */
    actorUserId: uuid("actor_user_id"),
    /** Forward / cancel / reversal (AC4). */
    kind: text("kind").notNull().$type<OrderEventKind>(),
    /** The idempotency key of the wc_outbox writeback enqueued for this event. */
    outboxIdempotencyKey: text("outbox_idempotency_key"),
    /** Mapped Woo status + note, and (on dispatch) rider/vehicle/contact/time (AC5). */
    metadata: jsonb("metadata").notNull().default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    wooOrderIdIdx: index("order_events_woo_order_id_idx").on(t.wooOrderId, t.createdAt),
  }),
);

export type OrderEventRow = typeof orderEvents.$inferSelect;
export type OrderEventInsert = typeof orderEvents.$inferInsert;

/**
 * One drifted SKU in a stored reconciliation report (Story 29.5 / P4-E04-S05,
 * AC6). The shape stored in the `drift` jsonb of {@link wcStockReconciliations}.
 */
export interface StockDriftEntry {
  productId: string;
  sku: string;
  name: string;
  wooProductId: number;
  localStock: number;
  wooStock: number | null;
  delta: number;
}

/**
 * Nightly stock-reconciliation report snapshot (Story 29.5 / P4-E04-S05, AC6).
 * One row per nightly run; `drift` is the list of SKUs whose local stock and Woo
 * stock disagree (worst-first). Reading Woo for this report is for COMPARISON
 * ONLY — it is never written back into local stock. The admin surface reads the
 * newest row.
 */
export const wcStockReconciliations = pgTable(
  "wc_stock_reconciliations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** When the nightly run generated this report. */
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Mapped products compared (unmapped products are skipped). */
    comparedCount: integer("compared_count").notNull().default(0),
    /** The drifted SKUs (local vs Woo deltas), worst-first. Empty = all in sync. */
    drift: jsonb("drift").notNull().default([]).$type<StockDriftEntry[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    generatedAtIdx: index("wc_stock_reconciliations_generated_at_idx").on(t.generatedAt),
  }),
);

export type WcStockReconciliationRow = typeof wcStockReconciliations.$inferSelect;
export type WcStockReconciliationInsert = typeof wcStockReconciliations.$inferInsert;
