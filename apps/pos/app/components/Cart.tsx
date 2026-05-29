"use client";

import { useState } from "react";
import {
  computeTotals,
  decrementQty,
  incrementQty,
  removeLine,
  setLineDiscountPct,
  setOverallDiscount,
  validateStock,
  type Cart as CartModel,
  type OverallDiscount,
} from "../../lib/cart";
import { formatKes } from "../../lib/products";

export interface CartProps {
  cart: CartModel;
  onChange: (cart: CartModel) => void;
  /** Called only when the Pay-step stock check passes (AC4). Payment is S04. */
  onProceed?: () => void;
}

/**
 * Active-sale cart (P2-E04-S03). Lines with qty +/- , remove, and a per-line
 * discount % (AC1); an overall discount as % or KES (AC2); totals that recompute
 * live with per-line VAT (AC3). The Pay button runs the stock check and blocks
 * with a clear error when any line exceeds available stock (AC4); the payment
 * flow itself lands in S04.
 */
export function Cart({ cart, onChange, onProceed }: CartProps) {
  const [stockError, setStockError] = useState<string | null>(null);
  const totals = computeTotals(cart);

  const overallMode: OverallDiscount["kind"] = cart.overall.kind;
  const overallValue =
    cart.overall.kind === "pct"
      ? String(cart.overall.value)
      : cart.overall.kind === "kes"
        ? String(cart.overall.valueCents / 100)
        : "";

  function setOverallMode(kind: OverallDiscount["kind"]) {
    if (kind === "none") onChange(setOverallDiscount(cart, { kind: "none" }));
    else if (kind === "pct") onChange(setOverallDiscount(cart, { kind: "pct", value: 0 }));
    else onChange(setOverallDiscount(cart, { kind: "kes", valueCents: 0 }));
  }

  function setOverallValue(raw: string) {
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    if (cart.overall.kind === "pct") onChange(setOverallDiscount(cart, { kind: "pct", value: n }));
    else if (cart.overall.kind === "kes")
      onChange(setOverallDiscount(cart, { kind: "kes", valueCents: Math.round(n * 100) }));
  }

  function pay() {
    const check = validateStock(cart);
    if (!check.ok) {
      const detail = check.violations
        .map((v) => `${v.name} (only ${v.available} in stock, ${v.requested} requested)`)
        .join("; ");
      setStockError(`Insufficient stock: ${detail}`);
      return;
    }
    setStockError(null);
    onProceed?.();
  }

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-base font-semibold">Order</h2>

      {cart.lines.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60">No items yet.</p>
      ) : (
        <ul className="mt-2 flex flex-1 flex-col gap-2 overflow-auto">
          {totals.lines.map((line) => (
            <li key={line.productId} className="rounded-lg border border-ink/10 p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{line.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => onChange(removeLine(cart, line.productId))}
                  className="touch-target rounded px-2 text-sm text-danger"
                >
                  ✕
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <button
                  type="button"
                  aria-label={`Decrease ${line.name}`}
                  onClick={() => onChange(decrementQty(cart, line.productId))}
                  className="touch-target rounded-lg border border-ink/20 px-3"
                >
                  −
                </button>
                <span className="w-8 text-center tabular-nums">{line.qty}</span>
                <button
                  type="button"
                  aria-label={`Increase ${line.name}`}
                  onClick={() => onChange(incrementQty(cart, line.productId))}
                  className="touch-target rounded-lg border border-ink/20 px-3"
                >
                  +
                </button>
                <label className="ml-auto flex items-center gap-1">
                  Disc %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={line.lineDiscountPct}
                    onChange={(e) =>
                      onChange(setLineDiscountPct(cart, line.productId, Number(e.target.value)))
                    }
                    className="w-16 rounded border border-ink/20 px-2 py-1"
                  />
                </label>
                <span className="w-24 text-right tabular-nums">{formatKes(line.grossCents)}</span>
              </div>
              {/* Per-line VAT (AC3 — tax shown per line per the product's tax treatment). */}
              <div className="mt-0.5 text-right text-xs text-ink/50">
                {line.taxCents > 0 ? `incl. VAT ${formatKes(line.taxCents)}` : "VAT exempt"}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2 text-sm">
        <span>Overall discount</span>
        <select
          aria-label="Overall discount type"
          value={overallMode}
          onChange={(e) => setOverallMode(e.target.value as OverallDiscount["kind"])}
          className="rounded border border-ink/20 px-2 py-1"
        >
          <option value="none">None</option>
          <option value="pct">%</option>
          <option value="kes">KES</option>
        </select>
        {overallMode !== "none" && (
          <input
            type="number"
            min={0}
            aria-label="Overall discount amount"
            value={overallValue}
            onChange={(e) => setOverallValue(e.target.value)}
            className="w-24 rounded border border-ink/20 px-2 py-1"
          />
        )}
      </div>

      <dl className="mt-3 flex flex-col gap-1 border-t border-ink/10 pt-3 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal (excl. VAT)</dt>
          <dd className="tabular-nums">{formatKes(totals.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between text-ink/70">
          <dt>Discount</dt>
          <dd className="tabular-nums">−{formatKes(totals.discountTotalCents)}</dd>
        </div>
        <div className="flex justify-between text-ink/70">
          <dt>VAT</dt>
          <dd className="tabular-nums">{formatKes(totals.taxTotalCents)}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatKes(totals.grandTotalCents)}</dd>
        </div>
      </dl>

      {stockError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {stockError}
        </p>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={cart.lines.length === 0}
        className="touch-target mt-4 w-full rounded-lg bg-brand px-4 font-medium text-surface disabled:opacity-50"
      >
        Pay {formatKes(totals.grandTotalCents)}
      </button>
    </div>
  );
}
