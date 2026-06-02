"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  filterOnlineOrdersByStatus,
  sortOnlineOrdersNewFirst,
  type OnlineOrderCard,
  type OnlineOrderFilter,
} from "@bm/contracts";
import {
  ONLINE_ORDER_CHIPS,
  chipLabel,
  countByStatus,
  formatItemSummary,
  hasNewOrders,
  statusLabel,
} from "../../lib/online-orders";
import { fetchOnlineOrders } from "../../lib/online-orders-api";
import { printPackingSlip } from "../../lib/packing-slip-print";
import { OrderActionSheet } from "./OrderActionSheet";

/** Poll the mirror every 30s so the queue stays fresh without a Woo call (AC5). */
const REFRESH_MS = 30_000;

/**
 * The POS "Online orders" tab (Story 29.1 / P4-E04-S01). A client island that
 * reads orders STRICTLY from the local `wc_orders` mirror via the API (AC5 — it
 * never calls Woo): the queue shows New orders first (AC2), filter chips select by
 * workflow status (AC4), and each card carries items + qty, customer name, phone
 * LAST 4 ONLY, delivery method, payment status (AC3), plus the source Woo order id
 * and last-synced timestamp (AC6). When a New order arrives a subtle alert tone
 * plays — the cashier can toggle it off (AC2).
 *
 * `initialOrders` lets the render be driven deterministically in tests; in the app
 * it defaults to empty and the queue hydrates from the mirror on mount + on a poll.
 */
export function OnlineOrders({
  initialOrders = [],
  canReverse = false,
}: {
  initialOrders?: OnlineOrderCard[];
  /** Whether the signed-in staffer may reverse an order to an earlier status (admin — AC4). */
  canReverse?: boolean;
}) {
  const [orders, setOrders] = useState<OnlineOrderCard[]>(initialOrders);
  const [filter, setFilter] = useState<OnlineOrderFilter | null>(null);
  const [toneOn, setToneOn] = useState(true);
  // Remember the New-order ids we have already chimed for, so the tone only fires
  // on a genuinely new arrival rather than on every poll.
  const chimedRef = useRef<Set<number>>(new Set(initialOrders.filter((o) => o.localStatus === "new").map((o) => o.wooOrderId)));

  // Hydrate + poll the mirror (AC5 — never a live Woo call from the client).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const next = await fetchOnlineOrders();
      if (!cancelled) setOrders(next);
    }
    void load();
    const handle = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  // After a transition, re-pull the mirror so the queue reflects the new status.
  async function refresh() {
    setOrders(await fetchOnlineOrders());
  }

  // A subtle alert tone when a New order arrives (AC2) — only when toggled on and
  // only for an id we have not chimed for yet.
  useEffect(() => {
    if (!toneOn) return;
    const fresh = orders.filter((o) => o.localStatus === "new" && !chimedRef.current.has(o.wooOrderId));
    if (fresh.length === 0) return;
    for (const o of fresh) chimedRef.current.add(o.wooOrderId);
    playAlertTone();
  }, [orders, toneOn]);

  const sorted = useMemo(() => sortOnlineOrdersNewFirst(orders), [orders]);
  const visible = useMemo(() => filterOnlineOrdersByStatus(sorted, filter), [sorted, filter]);
  const counts = useMemo(() => countByStatus(orders), [orders]);
  const newWaiting = hasNewOrders(orders);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Online orders</h1>
          <p className="mt-1 text-sm text-ink/60">
            Pulled from the website — read from the local mirror, never live.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input
            type="checkbox"
            checked={toneOn}
            onChange={(e) => setToneOn(e.target.checked)}
            className="h-5 w-5"
          />
          Alert tone{newWaiting ? " · New waiting" : ""}
        </label>
      </div>

      {/* Filter chips (AC4). */}
      <div role="tablist" aria-label="Order status" className="flex flex-wrap gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={filter === null}
          onClick={() => setFilter(null)}
          className={`touch-target rounded-full border px-4 text-sm ${
            filter === null ? "border-brand bg-brand text-surface" : "border-ink/20"
          }`}
        >
          All
        </button>
        {ONLINE_ORDER_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            role="tab"
            aria-selected={filter === chip}
            onClick={() => setFilter(chip)}
            className={`touch-target rounded-full border px-4 text-sm ${
              filter === chip ? "border-brand bg-brand text-surface" : "border-ink/20"
            }`}
          >
            {chipLabel(chip)} ({counts[chip]})
          </button>
        ))}
      </div>

      {/* The queue (New-first — AC2). */}
      {visible.length === 0 ? (
        <p role="status" className="text-sm text-ink/60">
          No online orders to show.
        </p>
      ) : (
        <ul aria-label="Online orders" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((order) => (
            <OrderCard key={order.wooOrderId} order={order} canReverse={canReverse} onTransitioned={() => void refresh()} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** One order card (AC3/AC6) with its workflow action sheet (Story 29.2). */
function OrderCard({
  order,
  canReverse,
  onTransitioned,
}: {
  order: OnlineOrderCard;
  canReverse: boolean;
  onTransitioned: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-ink/10 p-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-semibold">Order #{order.number ?? order.wooOrderId}</span>
          <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink/70">
            {statusLabel(order.localStatus)}
          </span>
        </div>
        <span className="text-sm font-medium">
          {order.currency ? `${order.currency} ` : ""}
          {order.total ?? "—"}
        </span>
      </div>

      <div className="text-sm text-ink/80">
        <p>{order.customerName ?? "Unknown customer"}</p>
        {order.customerPhoneLast4 && <p className="text-ink/60">Phone {order.customerPhoneLast4}</p>}
      </div>

      <ul className="flex flex-col gap-0.5 text-sm">
        {order.items.length === 0 ? (
          <li className="text-ink/50">No line items</li>
        ) : (
          order.items.map((item, i) => <li key={i}>{formatItemSummary(item)}</li>)
        )}
      </ul>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/60">
        <span>Delivery: {order.deliveryMethod ?? "—"}</span>
        <span>
          Payment: {order.paymentStatus === "paid" ? "Paid" : "Unpaid"}
          {order.paymentMethod ? ` (${order.paymentMethod})` : ""}
        </span>
      </div>

      {/* Workflow action sheet (Story 29.2 — AC1/AC4/AC5). */}
      <div className="mt-1 border-t border-ink/5 pt-2">
        <OrderActionSheet
          wooOrderId={order.wooOrderId}
          current={order.localStatus}
          canReverse={canReverse}
          onTransitioned={onTransitioned}
        />
      </div>

      {/* Print packing slip (Story 29.3 — AC1). Renders from the mirror-built slip
          on the card (AC4 — no live Woo call) and prints to the system default
          printer via the browser print dialog (AC3, Decision 13). */}
      <div className="mt-1">
        <button
          type="button"
          onClick={() => printPackingSlip(order.packingSlip)}
          className="touch-target rounded-lg border border-ink/20 px-4 text-sm text-ink/80"
        >
          Print packing slip
        </button>
      </div>

      {/* Source Woo order id + last-synced (AC6). */}
      <div className="mt-1 border-t border-ink/5 pt-2 text-xs text-ink/50">
        Woo #{order.wooOrderId} · Synced {formatSyncedAt(order.lastSyncedAt)}
      </div>
    </li>
  );
}

/** Render the last-synced ISO instant as a short local time string (AC6). */
function formatSyncedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** Play a short, subtle chime via the Web Audio API (AC2). No-op when unavailable. */
function playAlertTone(): void {
  if (typeof window === "undefined") return;
  const AudioCtx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.05; // subtle
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => void ctx.close();
  } catch {
    // Audio is best-effort — never let a chime failure break the queue.
  }
}
