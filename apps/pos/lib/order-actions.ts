import {
  ORDER_TRANSITION_ACTIONS,
  classifyTransition,
  type OrderTransitionAction,
  type WcLocalStatus,
} from "@bm/contracts";

/**
 * Pure POS order action-sheet helpers (Story 29.2 / P4-E04-S02). Decide which of
 * the five actions (AC1) are enabled for the order's CURRENT status, and whether
 * the action requires the admin role (a reversal — AC4) or dispatch detail (AC5).
 * Kept dependency-free + unit-tested so the action-sheet component stays thin
 * (mirrors `apps/pos/lib/online-orders.ts`).
 */

/** One row in the action sheet: the action key, its label, and its enablement. */
export interface OrderActionState {
  action: OrderTransitionAction;
  label: string;
  to: WcLocalStatus;
  /** False when the move is illegal from the current status (disabled — AC4). */
  enabled: boolean;
  /** True when the move is a reversal — only an admin may perform it (AC4). */
  reversal: boolean;
  /** True when the action requires rider/courier detail before submit (AC5). */
  requiresDispatch: boolean;
}

/**
 * Build the action-sheet state for an order at `current` status, optionally for a
 * given `role`. Every action is always listed (AC1); an action is `enabled` only
 * when the move is legal from `current` AND — for a reversal — the role may
 * reverse. A non-admin therefore sees reversal actions present but DISABLED (AC4).
 */
export function orderActionStates(
  current: WcLocalStatus,
  opts: { canReverse?: boolean } = {},
): OrderActionState[] {
  const canReverse = opts.canReverse ?? false;
  return ORDER_TRANSITION_ACTIONS.map((def) => {
    const kind = classifyTransition(current, def.to);
    const reversal = kind === "reversal";
    const legal = kind !== "invalid";
    const enabled = legal && (!reversal || canReverse);
    return {
      action: def.action,
      label: def.label,
      to: def.to,
      enabled,
      reversal,
      requiresDispatch: def.to === "dispatched",
    };
  });
}

/** The subset of actions enabled for `current` (the buttons a staffer can tap). */
export function enabledOrderActions(
  current: WcLocalStatus,
  opts: { canReverse?: boolean } = {},
): OrderActionState[] {
  return orderActionStates(current, opts).filter((a) => a.enabled);
}
