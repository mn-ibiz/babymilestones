/**
 * Packing-slip view-model (Story 29.3 / P4-E04-S03).
 *
 * The POS prints a packing slip per WooCommerce order so the packer can pack and
 * dispatch it. The slip is built STRICTLY from the local `wc_orders` mirror row
 * (AC4) — there is NO Woo client in this builder's signature, so a print-time
 * render can never reach for a live Woo call. Every field is extracted from the
 * stored `payload`, validated through the contracts Woo order schema, so a
 * malformed payload degrades gracefully rather than throwing.
 *
 * It carries exactly the facts a packer needs (AC2): the Woo order number, the
 * customer name + FULL phone (unlike the on-screen card, which masks the phone —
 * a packer needs the real number to reach the customer on delivery), the shipping
 * address, the delivery method, the line items + per-line quantity (qty is
 * MANDATORY), and the customer note / special instructions. It deliberately
 * carries NO price totals — a packing slip is not a receipt.
 *
 * When the order has no real shipping street address, the slip is a pickup: the
 * address list is empty, `pickupInStore` is true, and the delivery method falls
 * back to "Pickup in store" (test hint).
 */
import { wooOrderSchema } from "./woocommerce.js";
import type { OnlineOrderItem, OnlineOrderMirrorRow } from "./woocommerce-orders.js";

/** Delivery-method label shown when an order has no shipping address. */
export const PICKUP_IN_STORE = "Pickup in store";

/**
 * The packing-slip render model — everything the print template needs, already
 * shaped from a mirror row. No price totals (AC2). Built by {@link toPackingSlip}.
 */
export interface PackingSlip {
  /** The Woo human order number (falls back to the order id when absent). */
  orderNumber: string;
  /** Billing first + last name, or null when the payload carries neither. */
  customerName: string | null;
  /** The customer's FULL phone (the packer must reach them), or null when absent. */
  customerPhone: string | null;
  /** Shipping address lines (street, city/state/postcode, country); [] for a pickup. */
  shippingAddress: string[];
  /** The Woo shipping line title, or {@link PICKUP_IN_STORE} when there is none. */
  deliveryMethod: string;
  /** Line items + per-line quantity (qty mandatory — AC2). */
  items: OnlineOrderItem[];
  /** The customer note / special instructions, or null when absent. */
  customerNote: string | null;
  /** True when there is no shipping street address — the order is collected in store. */
  pickupInStore: boolean;
}

/** Extract a trimmed string field from a record, or null when absent/blank. */
function strField(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Build the human shipping address lines from a Woo `shipping` block. Returns []
 * when there is no real street address (only a country, or nothing at all) — the
 * caller treats that as a pickup. The `city, state postcode` parts are merged
 * onto a single line; empty parts are dropped.
 */
function shippingAddressLines(shipping: Record<string, unknown>): string[] {
  const line1 = strField(shipping, "address_1");
  // No street address → not a real delivery address (a country alone is a pickup).
  if (!line1) return [];

  const lines: string[] = [line1];
  const line2 = strField(shipping, "address_2");
  if (line2) lines.push(line2);

  const city = strField(shipping, "city");
  const state = strField(shipping, "state");
  const postcode = strField(shipping, "postcode");
  const cityLine = [
    [city, state].filter(Boolean).join(", "),
    postcode,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (cityLine) lines.push(cityLine);

  const country = strField(shipping, "country");
  if (country) lines.push(country);

  return lines;
}

/**
 * Map one `wc_orders` mirror row to a {@link PackingSlip}. Every field comes out
 * of the stored `payload` (AC4) — unary by design so it can never reach for a Woo
 * client at print time.
 */
export function toPackingSlip(row: OnlineOrderMirrorRow): PackingSlip {
  // Validate the payload through the Woo order schema; on a malformed payload we
  // still build a (degraded) slip rather than throwing into the print path.
  const parsed = wooOrderSchema.safeParse(row.payload);
  const order: Record<string, unknown> = parsed.success
    ? (parsed.data as Record<string, unknown>)
    : row.payload;

  const orderNumber = row.number ?? strField(order, "number") ?? String(row.wooOrderId);

  // Customer name + FULL phone from billing (the packer needs the real number).
  const billing = (order.billing ?? {}) as Record<string, unknown>;
  const first = strField(billing, "first_name");
  const last = strField(billing, "last_name");
  const customerName = [first, last].filter(Boolean).join(" ") || null;
  const customerPhone = strField(billing, "phone");

  // Shipping address (AC2); an empty result means a pickup.
  const shipping = (order.shipping ?? {}) as Record<string, unknown>;
  const shippingAddress = shippingAddressLines(shipping);
  const pickupInStore = shippingAddress.length === 0;

  // Delivery method = the first Woo shipping line title (AC2); pickup fallback.
  const shippingLines = Array.isArray(order.shipping_lines) ? order.shipping_lines : [];
  const firstShip = (shippingLines[0] ?? {}) as Record<string, unknown>;
  const deliveryMethod = strField(firstShip, "method_title") ?? PICKUP_IN_STORE;

  // Line items + mandatory qty (AC2).
  const rawItems = Array.isArray(order.line_items) ? order.line_items : [];
  const items: OnlineOrderItem[] = rawItems.map((li) => {
    const item = (li ?? {}) as Record<string, unknown>;
    const name = strField(item, "name") ?? "Item";
    const quantity = typeof item.quantity === "number" ? item.quantity : 0;
    return { name, quantity };
  });

  const customerNote = strField(order, "customer_note");

  return {
    orderNumber,
    customerName,
    customerPhone,
    shippingAddress,
    deliveryMethod,
    items,
    customerNote,
    pickupInStore,
  };
}
