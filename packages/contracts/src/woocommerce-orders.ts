import { wooOrderSchema } from "./woocommerce.js";
import { toPackingSlip, type PackingSlip } from "./packing-slip.js";

/**
 * POS "Online orders" view-model (Story 29.1 / P4-E04-S01).
 *
 * The POS reads orders ONLY from the local `wc_orders` mirror populated by the
 * sync pull (S07) — it NEVER calls WooCommerce on render (AC5). This module is
 * the pure mapper from a mirror row into the card the till shows:
 *
 *   - line items + per-line qty and a total item count (AC3);
 *   - customer name (billing first + last);
 *   - customer phone MASKED to the last 4 digits only (AC3 — never the full number);
 *   - delivery method (the Woo shipping line title);
 *   - payment status (paid / unpaid, derived from the Woo `date_paid`) + method;
 *   - the source Woo order id + last-synced timestamp (AC6);
 *   - the POS workflow `local_status` driving the New-first ordering (AC2) and the
 *     filter chips (AC4).
 *
 * Every display field is extracted from the stored `payload`, validated through
 * the contracts Woo order schema, so a malformed payload degrades gracefully
 * rather than throwing into the render. Dependency-light (zod only) and shared by
 * the read API and the POS UI.
 */

/** Every status persisted on `wc_orders.local_status` (the POS workflow vocabulary). */
export const WC_LOCAL_STATUSES = [
  "new",
  "packing",
  "ready",
  "dispatched",
  "fulfilled",
  "cancelled",
] as const;

export type WcLocalStatus = (typeof WC_LOCAL_STATUSES)[number];

/**
 * The filter chips shown above the queue (AC4): New, Packing, Ready, Dispatched,
 * Fulfilled. `cancelled` is a valid persisted status but is not a queue chip.
 */
export const ONLINE_ORDER_FILTERS = [
  "new",
  "packing",
  "ready",
  "dispatched",
  "fulfilled",
] as const;

export type OnlineOrderFilter = (typeof ONLINE_ORDER_FILTERS)[number];

/** Payment status derived from the Woo payload (we never call Woo on render). */
export type OnlineOrderPaymentStatus = "paid" | "unpaid";

/** One line item as the card shows it: the product name + its quantity. */
export interface OnlineOrderItem {
  name: string;
  quantity: number;
}

/**
 * The slice of a `wc_orders` row the mapper reads. The API hands this straight
 * from the mirror table — no Woo call, no widening of the table for display
 * fields (those come out of `payload`).
 */
export interface OnlineOrderMirrorRow {
  wooOrderId: number;
  status: string;
  number: string | null;
  total: string | null;
  currency: string | null;
  localStatus: string;
  payload: Record<string, unknown>;
  /** When the row was last refreshed by the sync pull (the last-synced stamp — AC6). */
  updatedAt: Date;
}

/** A single "Online orders" card the POS renders (AC3/AC5/AC6). */
export interface OnlineOrderCard {
  /** The source WooCommerce order id (AC6). */
  wooOrderId: number;
  /** Woo's human order number (falls back to the id when absent). */
  number: string | null;
  /** The POS workflow status driving ordering (AC2) + chips (AC4). */
  localStatus: WcLocalStatus;
  /** Line items + per-line quantity (AC3). */
  items: OnlineOrderItem[];
  /** Total quantity across every line (AC3). */
  itemCount: number;
  /** Billing first + last name, or null when the payload carries neither. */
  customerName: string | null;
  /** Phone MASKED to the last 4 digits only (AC3), or null when absent. */
  customerPhoneLast4: string | null;
  /** The Woo shipping line title (AC3), or null when there is none. */
  deliveryMethod: string | null;
  /** Paid / unpaid, derived from the Woo `date_paid` (AC3). */
  paymentStatus: OnlineOrderPaymentStatus;
  /** The Woo payment method title (AC3), or null when absent. */
  paymentMethod: string | null;
  /** Order total (string as Woo reports it) + currency. */
  total: string | null;
  currency: string | null;
  /** ISO instant the row was last synced from Woo (AC6). */
  lastSyncedAt: string;
  /**
   * The packing slip built from the SAME mirror row (Story 29.3 / P4-E04-S03).
   * Carried on the card so the POS can print without a second fetch — and never a
   * live Woo call at print time (AC4). Distinct from the on-screen card fields:
   * it carries the FULL phone + shipping address + customer note + qty, no totals.
   */
  packingSlip: PackingSlip;
}

/** The POS Online-orders read response (the mirror cards — never a live Woo call). */
export interface OnlineOrdersResponse {
  orders: OnlineOrderCard[];
}

/** New orders sort first; the rest keep the workflow order, then newest-synced. */
const STATUS_RANK: Record<WcLocalStatus, number> = {
  new: 0,
  packing: 1,
  ready: 2,
  dispatched: 3,
  fulfilled: 4,
  cancelled: 5,
};

/** Coerce an arbitrary persisted status string into a known local status. */
function asLocalStatus(value: string): WcLocalStatus {
  return (WC_LOCAL_STATUSES as readonly string[]).includes(value)
    ? (value as WcLocalStatus)
    : "new";
}

/**
 * Mask a phone to its last 4 digits — `••••5678` (AC3). Non-digits are ignored
 * when taking the tail. Returns null for an empty/absent number; a number with 4
 * or fewer digits is returned unmasked (there is nothing extra to hide).
 */
export function maskPhoneLast4(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.length <= 4) return digits;
  return `••••${digits.slice(-4)}`;
}

/** Extract a trimmed string field from a record, or null when absent/blank. */
function strField(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Map one mirror row to a card. Every display field comes out of `payload` (AC5). */
export function toOnlineOrderCard(row: OnlineOrderMirrorRow): OnlineOrderCard {
  // Validate the payload through the Woo order schema; on a malformed payload we
  // still render a card (degraded) rather than throwing into the queue.
  const parsed = wooOrderSchema.safeParse(row.payload);
  const order: Record<string, unknown> = parsed.success
    ? (parsed.data as Record<string, unknown>)
    : row.payload;

  // Line items + qty (AC3).
  const rawItems = Array.isArray(order.line_items) ? order.line_items : [];
  const items: OnlineOrderItem[] = rawItems.map((li) => {
    const item = (li ?? {}) as Record<string, unknown>;
    const name = strField(item, "name") ?? "Item";
    const quantity = typeof item.quantity === "number" ? item.quantity : 0;
    return { name, quantity };
  });
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  // Customer name + masked phone (AC3) from billing.
  const billing = (order.billing ?? {}) as Record<string, unknown>;
  const first = strField(billing, "first_name");
  const last = strField(billing, "last_name");
  const customerName = [first, last].filter(Boolean).join(" ") || null;
  const customerPhoneLast4 = maskPhoneLast4(strField(billing, "phone"));

  // Delivery method = the first Woo shipping line title (AC3).
  const shippingLines = Array.isArray(order.shipping_lines) ? order.shipping_lines : [];
  const firstShip = (shippingLines[0] ?? {}) as Record<string, unknown>;
  const deliveryMethod = strField(firstShip, "method_title");

  // Payment status (AC3): Woo marks paid orders with a `date_paid`.
  const datePaid = strField(order, "date_paid");
  const paymentStatus: OnlineOrderPaymentStatus = datePaid ? "paid" : "unpaid";
  const paymentMethod = strField(order, "payment_method_title");

  return {
    wooOrderId: row.wooOrderId,
    number: row.number ?? strField(order, "number"),
    localStatus: asLocalStatus(row.localStatus),
    items,
    itemCount,
    customerName,
    customerPhoneLast4,
    deliveryMethod,
    paymentStatus,
    paymentMethod,
    total: row.total ?? strField(order, "total"),
    currency: row.currency ?? strField(order, "currency"),
    lastSyncedAt: row.updatedAt.toISOString(),
    // The print-ready packing slip, built from the same mirror row (29.3 / AC4).
    packingSlip: toPackingSlip(row),
  };
}

/**
 * Order cards New-first (AC2): by workflow rank (New ahead of everything), then
 * newest-synced first within a rank. Returns a new array (does not mutate input).
 */
export function sortOnlineOrdersNewFirst(cards: OnlineOrderCard[]): OnlineOrderCard[] {
  return [...cards].sort((a, b) => {
    const rank = STATUS_RANK[a.localStatus] - STATUS_RANK[b.localStatus];
    if (rank !== 0) return rank;
    // Newest-synced first within the same status.
    return b.lastSyncedAt.localeCompare(a.lastSyncedAt);
  });
}

/** Filter cards by the selected chip (AC4); a null filter returns every card. */
export function filterOnlineOrdersByStatus(
  cards: OnlineOrderCard[],
  status: OnlineOrderFilter | null,
): OnlineOrderCard[] {
  if (!status) return cards;
  return cards.filter((c) => c.localStatus === status);
}
