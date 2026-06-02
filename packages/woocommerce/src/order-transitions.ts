/**
 * Order-status transition WRITE PATH (Story 29.2 / P4-E04-S02).
 *
 * One operator-initiated transition does three things, atomically (one DB
 * transaction), with NO synchronous Woo call (AC2/AC6):
 *
 *   1. validate + authorize the move (the pure state machine in `@bm/contracts`):
 *      forward steps are one-up the ladder; cancel is allowed from any non-terminal;
 *      a reversal to an earlier status requires an admin role (AC4);
 *   2. update `wc_orders.local_status` to the target;
 *   3. insert ONE audit-grade `order_events` row (from/to/actor/kind/metadata — the
 *      dispatch rider/vehicle/contact/time goes here for a dispatched move, AC5);
 *   4. enqueue EXACTLY ONE `wc_outbox` writeback (kind `order_status`) carrying the
 *      mapped Woo status + note, keyed by (woo_order_id, local_status, attempt_id)
 *      so a retry never double-applies (idempotency).
 *
 * The Woo writeback is the queued side-effect drained + retried + dead-lettered by
 * the Story 29.7 worker; this module does NOT touch Woo, so a Woo outage never
 * rolls back the local transition (AC6). It also does NOT trigger any SMS — Woo
 * owns customer notifications for online orders (deliberate scope cut).
 */
import { eq } from "drizzle-orm";
import {
  orderEvents,
  wcOrders,
  type Database,
  type Transaction,
  type WcOrderLocalStatus,
} from "@bm/db";
import {
  mapLocalToWoo,
  planTransition,
  type DispatchDetail,
  type TransitionTargetStatus,
  type WcLocalToWooMap,
  type WcOrderStatusRequest,
} from "@bm/contracts";
import { enqueueWcWriteback } from "./sync.js";

type Executor = Database | Transaction;

/**
 * The stable idempotency key for an order-status writeback (idempotency AC): keyed
 * by the Woo order id, the target local status, and a per-attempt id so two
 * distinct attempts at the same target are distinguishable while a retry of the
 * SAME attempt is a no-op.
 */
export function transitionOutboxKey(
  wooOrderId: number,
  toStatus: TransitionTargetStatus,
  attemptId: string,
): string {
  return `wc-order:${wooOrderId}:${toStatus}:${attemptId}`;
}

export interface ApplyOrderTransitionInput {
  wooOrderId: number;
  /** The target local status (never `new` — that is the initial state only). */
  to: TransitionTargetStatus;
  /** The acting staffer's user id (audited on the order_events row). */
  actorUserId: string;
  /** The acting user's role (drives the reversal gate — AC4). */
  role: string;
  /** A per-attempt id baked into the outbox idempotency key (idempotency AC). */
  attemptId: string;
  /** Rider/courier/vehicle/contact/time, REQUIRED for a dispatched move (AC5). */
  dispatch?: DispatchDetail;
  /** Optional configurable local→Woo status override (AC3). */
  statusMap?: WcLocalToWooMap;
  /** Clock injection for deterministic enqueue timestamps in tests. */
  now?: Date;
}

/** Why a transition was rejected (mirrors the state-machine rejections + storage). */
export type ApplyOrderTransitionReason =
  | "invalid"
  | "forbidden"
  | "not_found"
  | "dispatch_required";

export type ApplyOrderTransitionResult =
  | {
      ok: true;
      kind: "forward" | "cancel" | "reversal";
      fromStatus: WcOrderLocalStatus;
      toStatus: WcOrderLocalStatus;
      orderEventId: string;
      outboxIdempotencyKey: string;
    }
  | { ok: false; reason: ApplyOrderTransitionReason };

/**
 * Apply one order-status transition (AC2/AC3/AC4/AC5/AC6). Runs in a single
 * transaction so the local_status update, the order_events insert and the outbox
 * enqueue commit together — and a rejected move writes nothing.
 */
export async function applyOrderTransition(
  db: Executor,
  input: ApplyOrderTransitionInput,
): Promise<ApplyOrderTransitionResult> {
  const now = input.now ?? new Date();

  // Load the current order from the mirror (the source of the `from` status).
  const [order] = await db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, input.wooOrderId));
  if (!order) return { ok: false, reason: "not_found" };

  const fromStatus = order.localStatus;

  // Validate + authorize via the pure state machine (AC4).
  const plan = planTransition({ from: fromStatus, to: input.to, role: input.role });
  if (!plan.ok) return { ok: false, reason: plan.reason };

  // A dispatched transition MUST carry the rider/courier detail (AC5).
  if (input.to === "dispatched" && !input.dispatch) {
    return { ok: false, reason: "dispatch_required" };
  }

  // Map the target local status to its Woo status + note (AC3/AC5).
  const mapping = mapLocalToWoo(input.to, input.statusMap, input.dispatch);
  const idempotencyKey = transitionOutboxKey(input.wooOrderId, input.to, input.attemptId);

  // The writeback request payload (validated by the contract on the drain side).
  const request: WcOrderStatusRequest = {
    wooOrderId: input.wooOrderId,
    status: mapping.status,
    ...(mapping.note ? { note: mapping.note } : {}),
  };

  // The order_events metadata: the mapped Woo status/note + (on dispatch) the
  // rider/vehicle/contact/time so the courier detail survives independently of the
  // Woo note write (AC5).
  const metadata: Record<string, unknown> = {
    woo: { status: mapping.status, ...(mapping.note ? { note: mapping.note } : {}) },
    ...(input.dispatch ? { dispatch: { ...input.dispatch } } : {}),
  };

  const run = async (tx: Executor): Promise<ApplyOrderTransitionResult> => {
    // (2) advance local_status.
    await tx
      .update(wcOrders)
      .set({ localStatus: input.to, updatedAt: now })
      .where(eq(wcOrders.wooOrderId, input.wooOrderId));

    // (3) the audit-grade order_events row.
    const [event] = await tx
      .insert(orderEvents)
      .values({
        wooOrderId: input.wooOrderId,
        fromStatus,
        toStatus: input.to,
        actorUserId: input.actorUserId,
        kind: plan.kind,
        outboxIdempotencyKey: idempotencyKey,
        metadata,
        createdAt: now,
      })
      .returning();

    // (4) enqueue exactly one Woo writeback (idempotent on the key).
    await enqueueWcWriteback(tx, {
      idempotencyKey,
      kind: "order_status",
      request: request as unknown as Record<string, unknown>,
      now,
    });

    return {
      ok: true,
      kind: plan.kind,
      fromStatus,
      toStatus: input.to,
      orderEventId: event!.id,
      outboxIdempotencyKey: idempotencyKey,
    };
  };

  // Run inside a transaction when the executor supports one (the top-level db);
  // a passed-in `tx` already provides atomicity.
  if (typeof (db as Database).transaction === "function") {
    return (db as Database).transaction((tx) => run(tx as unknown as Executor));
  }
  return run(db);
}
