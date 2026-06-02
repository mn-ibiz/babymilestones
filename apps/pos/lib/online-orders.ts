import {
  ONLINE_ORDER_FILTERS,
  type OnlineOrderCard,
  type OnlineOrderFilter,
  type OnlineOrderItem,
  type WcLocalStatus,
} from "@bm/contracts";

/**
 * Pure POS Online-orders display helpers (Story 29.1 / P4-E04-S01). Kept
 * dependency-free + unit-tested so the queue component stays a thin render
 * (mirrors the `apps/pos/lib/products.ts` convention). The card shaping itself
 * (extraction, phone masking, New-first ordering, filtering) lives in the shared
 * `@bm/contracts` view-model — this module is just the POS-side labels + tallies.
 */

/** The filter chips above the queue (AC4): New, Packing, Ready, Dispatched, Fulfilled. */
export const ONLINE_ORDER_CHIPS = ONLINE_ORDER_FILTERS;

const STATUS_LABELS: Record<WcLocalStatus, string> = {
  new: "New",
  packing: "Packing",
  ready: "Ready",
  dispatched: "Dispatched",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

/** Human label for a filter chip (AC4). */
export function chipLabel(chip: OnlineOrderFilter): string {
  return STATUS_LABELS[chip];
}

/** Human label for any local workflow status (including cancelled). */
export function statusLabel(status: WcLocalStatus): string {
  return STATUS_LABELS[status];
}

/** Tally cards by local status (drives the per-chip count badge). */
export function countByStatus(cards: OnlineOrderCard[]): Record<WcLocalStatus, number> {
  const counts: Record<WcLocalStatus, number> = {
    new: 0,
    packing: 0,
    ready: 0,
    dispatched: 0,
    fulfilled: 0,
    cancelled: 0,
  };
  for (const c of cards) counts[c.localStatus] += 1;
  return counts;
}

/** Whether the queue holds any New order — drives the subtle alert tone (AC2). */
export function hasNewOrders(cards: OnlineOrderCard[]): boolean {
  return cards.some((c) => c.localStatus === "new");
}

/** A line item summary for a card row: `2 × Baby carrier` (AC3). */
export function formatItemSummary(item: OnlineOrderItem): string {
  return `${item.quantity} × ${item.name}`;
}
