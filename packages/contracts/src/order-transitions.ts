import { z } from "zod";
import { type WcLocalStatus } from "./woocommerce-orders.js";

/**
 * POS order-status transition state machine + local→Woo status mapping
 * (Story 29.2 / P4-E04-S02). PURE — no db, no Woo client. Shared by the API
 * transition write-path, the POS action sheet (to enable/disable actions per the
 * current status) and the unit tests.
 *
 * The workflow is a linear ladder:
 *
 *   new → packing → ready → dispatched → fulfilled
 *
 * plus `cancelled`, reachable from any NON-terminal status. `fulfilled` and
 * `cancelled` are terminal (AC4). Rules:
 *   - FORWARD: exactly one step up the ladder. Skips are rejected (AC4).
 *   - CANCEL: any non-terminal → cancelled (AC4).
 *   - REVERSAL: any earlier status. Requires an admin role; POS staff cannot
 *     reverse (AC4).
 */

// ---------------------------------------------------------------------------
// The five POS actions (AC1)
// ---------------------------------------------------------------------------

/** The five action-sheet actions a staffer can tap on an order (AC1). */
export type OrderTransitionAction =
  | "start_packing"
  | "mark_ready"
  | "mark_dispatched"
  | "mark_fulfilled"
  | "cancel";

/** One action-sheet entry: its key, the human label (AC1), and the target status. */
export interface OrderTransitionActionDef {
  action: OrderTransitionAction;
  label: string;
  to: WcLocalStatus;
}

/**
 * The action sheet, in display order (AC1): Start packing, Mark ready, Mark
 * dispatched, Mark fulfilled, Cancel. Each carries the local status it moves the
 * order TO; the state machine decides whether it is legal from the current status.
 */
export const ORDER_TRANSITION_ACTIONS: readonly OrderTransitionActionDef[] = [
  { action: "start_packing", label: "Start packing", to: "packing" },
  { action: "mark_ready", label: "Mark ready", to: "ready" },
  { action: "mark_dispatched", label: "Mark dispatched", to: "dispatched" },
  { action: "mark_fulfilled", label: "Mark fulfilled", to: "fulfilled" },
  { action: "cancel", label: "Cancel", to: "cancelled" },
] as const;

// ---------------------------------------------------------------------------
// The linear ladder (AC4)
// ---------------------------------------------------------------------------

/** The forward fulfilment ladder; `cancelled` is off-ladder (reachable from any non-terminal). */
export const ORDER_FORWARD_LADDER: readonly WcLocalStatus[] = [
  "new",
  "packing",
  "ready",
  "dispatched",
  "fulfilled",
] as const;

const LADDER_RANK: Record<WcLocalStatus, number> = {
  new: 0,
  packing: 1,
  ready: 2,
  dispatched: 3,
  fulfilled: 4,
  // `cancelled` sits outside the linear ladder — it is not "after" fulfilled.
  cancelled: -1,
};

/** `fulfilled` and `cancelled` are terminal — no transition leaves them (AC4). */
export function isTerminalLocalStatus(status: WcLocalStatus): boolean {
  return status === "fulfilled" || status === "cancelled";
}

/** The single next forward status, or null at/after the end of the ladder (AC4). */
export function nextForwardStatus(from: WcLocalStatus): WcLocalStatus | null {
  const idx = ORDER_FORWARD_LADDER.indexOf(from);
  if (idx === -1) return null; // cancelled — off-ladder.
  const next = ORDER_FORWARD_LADDER[idx + 1];
  return next ?? null;
}

/** The classification of a requested `from → to` move. */
export type TransitionKind = "forward" | "reversal" | "cancel" | "invalid";

/**
 * Classify a requested transition independent of role (AC4):
 *   - `forward`  — exactly one step up the linear ladder.
 *   - `cancel`   — any NON-terminal ladder status → cancelled.
 *   - `reversal` — any earlier ladder status (down the ladder). An admin may even
 *                  reverse OUT of `fulfilled` (un-fulfill) as a correction; only
 *                  `cancelled` is a hard dead-end you cannot reverse out of here.
 *   - `invalid`  — a skip, a no-op, leaving `cancelled`, cancelling a terminal
 *                  status, or any other move.
 */
export function classifyTransition(from: WcLocalStatus, to: WcLocalStatus): TransitionKind {
  if (from === to) return "invalid"; // no-op.
  // `cancelled` is a hard dead-end — nothing (forward, cancel, or reversal) leaves it.
  if (from === "cancelled") return "invalid";

  if (to === "cancelled") {
    // Cancel is only legal from a NON-terminal status (AC4): a `fulfilled` order
    // is already done and cannot be cancelled through this flow.
    return isTerminalLocalStatus(from) ? "invalid" : "cancel";
  }

  const fromRank = LADDER_RANK[from];
  const toRank = LADDER_RANK[to];
  // Both must be on the ladder for a forward/reversal classification.
  if (fromRank < 0 || toRank < 0) return "invalid";

  if (toRank === fromRank + 1) return "forward"; // exactly one step up.
  if (toRank < fromRank) return "reversal"; // any earlier status (admin-only — gated in planTransition).
  return "invalid"; // a skip (toRank > fromRank + 1).
}

// ---------------------------------------------------------------------------
// Authorization (AC4)
// ---------------------------------------------------------------------------

/** Roles permitted to reverse an order to an earlier status (AC4). */
const ADMIN_REVERSAL_ROLES = new Set<string>(["admin", "super_admin"]);

/** True when `role` may reverse a transition (admin / super_admin only — AC4). */
export function canReverseTransition(role: string): boolean {
  return ADMIN_REVERSAL_ROLES.has(role);
}

export interface PlanTransitionInput {
  from: WcLocalStatus;
  to: WcLocalStatus;
  /** The acting user's role (drives the reversal gate — AC4). */
  role: string;
}

/** Why a planned transition was rejected. */
export type TransitionRejection = "invalid" | "forbidden";

/** The decision: a legal, authorized transition (its kind) or a typed rejection. */
export type TransitionPlan =
  | { ok: true; kind: Exclude<TransitionKind, "invalid"> }
  | { ok: false; reason: TransitionRejection };

/**
 * Decide whether `from → to` is legal AND authorized for `role` (AC4):
 *   - an `invalid` move (skip / no-op / leaving terminal) is rejected for ALL
 *     roles with reason `invalid`;
 *   - a `reversal` is allowed only for an admin role — otherwise rejected with
 *     reason `forbidden`;
 *   - `forward` and `cancel` are allowed for any (POS) role.
 */
export function planTransition(input: PlanTransitionInput): TransitionPlan {
  const kind = classifyTransition(input.from, input.to);
  if (kind === "invalid") return { ok: false, reason: "invalid" };
  if (kind === "reversal" && !canReverseTransition(input.role)) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, kind };
}

// ---------------------------------------------------------------------------
// Local → Woo status mapping (AC3, AC5)
// ---------------------------------------------------------------------------

/** A local status that a transition can move an order TO (i.e. not `new`). */
export type TransitionTargetStatus = Exclude<WcLocalStatus, "new">;

/**
 * The default local→Woo status map (AC3):
 *   packing → processing; ready → processing (+note); dispatched → completed
 *   (+tracking note); fulfilled → completed; cancelled → cancelled.
 * Configurable: the write-path accepts an override partial map.
 */
export const WC_LOCAL_TO_WOO_DEFAULT: Readonly<Record<TransitionTargetStatus, string>> = {
  packing: "processing",
  ready: "processing",
  dispatched: "completed",
  fulfilled: "completed",
  cancelled: "cancelled",
} as const;

/** A configurable override of the default local→Woo status map (AC3). */
export type WcLocalToWooMap = Partial<Record<TransitionTargetStatus, string>>;

/** The dispatch detail captured on a `mark_dispatched` transition (AC5). */
export interface DispatchDetail {
  /** Rider / courier name (AC5). */
  riderName: string;
  /** Vehicle registration / identifier (AC5). */
  vehicle?: string;
  /** Rider contact number (AC5). */
  contact?: string;
  /** ISO instant the order was dispatched (AC5). */
  dispatchedAt: string;
}

/** The Woo writeback shape a transition maps to: the mapped status + an optional note. */
export interface WooStatusMapping {
  status: string;
  note?: string;
}

/** Build the human-readable Woo order note for a dispatch (AC5). */
export function buildDispatchNote(detail: DispatchDetail): string {
  const parts = [`Dispatched with ${detail.riderName}`];
  if (detail.vehicle) parts.push(`vehicle ${detail.vehicle}`);
  if (detail.contact) parts.push(`contact ${detail.contact}`);
  parts.push(`at ${detail.dispatchedAt}`);
  return parts.join(", ") + ".";
}

/** The standard "ready for collection/dispatch" note appended on `ready` (AC3). */
export const READY_NOTE = "Order is packed and ready.";

/**
 * Map a transition-target local status to its Woo status + optional note (AC3/AC5).
 * `override` swaps the mapped status for that local status only (configurable map).
 * `dispatch` supplies the rider/vehicle/time captured on a dispatched transition,
 * which is rendered into the Woo note (AC5).
 */
export function mapLocalToWoo(
  to: TransitionTargetStatus,
  override?: WcLocalToWooMap,
  dispatch?: DispatchDetail,
): WooStatusMapping {
  const status = override?.[to] ?? WC_LOCAL_TO_WOO_DEFAULT[to];
  if (to === "ready") return { status, note: READY_NOTE };
  if (to === "dispatched") {
    // A dispatched transition always carries a tracking note (AC5). When no detail
    // is supplied (shouldn't happen — the API requires it) we still post the status.
    return dispatch ? { status, note: buildDispatchNote(dispatch) } : { status };
  }
  return { status };
}

// ---------------------------------------------------------------------------
// API request contract (AC1/AC5)
// ---------------------------------------------------------------------------

/** The set of action keys the API accepts (AC1). */
export const ORDER_TRANSITION_ACTION_KEYS = ORDER_TRANSITION_ACTIONS.map((a) => a.action) as [
  OrderTransitionAction,
  ...OrderTransitionAction[],
];

/** Resolve an action key to its target local status, or null when unknown. */
export function actionTargetStatus(action: string): TransitionTargetStatus | null {
  const def = ORDER_TRANSITION_ACTIONS.find((a) => a.action === action);
  return def ? (def.to as TransitionTargetStatus) : null;
}

/** The dispatch detail accepted on the API (rider/vehicle/contact — time is server-stamped). */
export const dispatchDetailRequestSchema = z.object({
  riderName: z.string().trim().min(1, "Rider/courier name is required"),
  vehicle: z.string().trim().min(1).optional(),
  contact: z.string().trim().min(1).optional(),
});
export type DispatchDetailRequest = z.infer<typeof dispatchDetailRequestSchema>;

/**
 * The POS order-transition request body (AC1/AC5): the action tapped on the
 * action sheet plus, for `mark_dispatched`, the rider/courier detail. The Woo
 * order id is a route param, not a body field.
 */
export const orderTransitionRequestSchema = z.object({
  action: z.enum(ORDER_TRANSITION_ACTION_KEYS),
  /** Required for `mark_dispatched` (validated at the route — AC5). */
  dispatch: dispatchDetailRequestSchema.optional(),
});
export type OrderTransitionRequest = z.infer<typeof orderTransitionRequestSchema>;
