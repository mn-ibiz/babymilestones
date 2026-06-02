/**
 * POS "Online orders" read query (Story 29.1 / P4-E04-S01).
 *
 * Reads orders ONLY from the local `wc_orders` mirror (AC5) — there is no Woo
 * client here, by construction, so the POS render path can never call Woo. Each
 * row is shaped into an `OnlineOrderCard` by the contracts view-model (every
 * display field extracted from the stored `payload`), and the list is returned
 * New-first (AC2). The POS UI applies the chip filter (AC4) client-side over this
 * full list.
 */
import { desc } from "drizzle-orm";
import { wcOrders, type Database, type Transaction } from "@bm/db";
import {
  sortOnlineOrdersNewFirst,
  toOnlineOrderCard,
  type OnlineOrderCard,
} from "@bm/contracts";

type Executor = Database | Transaction;

/** List every mirrored order as a card, New-first (AC2). Mirror-only — no Woo (AC5). */
export async function listOnlineOrders(db: Executor): Promise<OnlineOrderCard[]> {
  const rows = await db
    .select({
      wooOrderId: wcOrders.wooOrderId,
      status: wcOrders.status,
      number: wcOrders.number,
      total: wcOrders.total,
      currency: wcOrders.currency,
      localStatus: wcOrders.localStatus,
      payload: wcOrders.payload,
      updatedAt: wcOrders.updatedAt,
    })
    .from(wcOrders)
    .orderBy(desc(wcOrders.updatedAt));

  const cards = rows.map((r) =>
    toOnlineOrderCard({
      wooOrderId: r.wooOrderId,
      status: r.status,
      number: r.number,
      total: r.total,
      currency: r.currency,
      localStatus: r.localStatus,
      payload: r.payload,
      updatedAt: r.updatedAt,
    }),
  );
  return sortOnlineOrdersNewFirst(cards);
}
