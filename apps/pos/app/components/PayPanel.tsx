"use client";

import { useEffect, useRef, useState } from "react";
import type { PosSaleMethod, PosSaleResponse } from "@bm/contracts";
import {
  POS_PAY_METHODS,
  changeDueCents,
  drawerMessage,
  isTenderSufficient,
  methodLabel,
  requiresCustomerPhone,
} from "../../lib/pay";
import { formatKes } from "../../lib/products";
import { createSale, confirmSale } from "../../lib/sales-api";
import type { Cart } from "../../lib/cart";

export interface PayPanelProps {
  cart: Cart;
  totalCents: number;
  /** Called once the sale is paid (the screen clears the cart). */
  onPaid: (sale: PosSaleResponse) => void;
  onCancel: () => void;
}

/**
 * Payment panel (P2-E04-S04). Offers all four methods (AC1): cash with a tender
 * field + live change and drawer message (AC2); M-Pesa with a phone field, STK
 * push, and a live status panel that polls confirm (AC3); Paystack with a phone
 * field that opens a hosted-checkout link/QR then verifies (AC4); wallet with a
 * phone lookup (AC5). On success the cart is cleared (AC6). Failures surface a
 * distinct message (AC7).
 */
export function PayPanel({ cart, totalCents, onPaid, onCancel }: PayPanelProps) {
  const [method, setMethod] = useState<PosSaleMethod>("cash");
  const [phone, setPhone] = useState("");
  const [tender, setTender] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PosSaleResponse | null>(null);
  // One idempotency key per pay attempt — a retried create returns the same sale.
  const idemRef = useRef<string>(typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}`);

  const parsedTender = Number(tender);
  const tenderCents = Number.isFinite(parsedTender) ? Math.round(parsedTender * 100) : NaN;
  const tenderOk = Number.isFinite(tenderCents) && isTenderSufficient(totalCents, tenderCents);

  function pickMethod(m: PosSaleMethod) {
    setMethod(m);
    setError(null);
    setPhone("");
    setTender("");
    // A different method is a different logical attempt — issue a fresh
    // idempotency key so the server doesn't replay the prior method's sale.
    if (typeof crypto !== "undefined") idemRef.current = crypto.randomUUID();
  }

  async function start() {
    setError(null);
    if (requiresCustomerPhone(method) && phone.trim() === "") {
      setError("Enter the customer's phone number.");
      return;
    }
    if (method === "cash" && !tenderOk) {
      setError("Cash tendered is less than the total.");
      return;
    }
    setBusy(true);
    try {
      const res = await createSale(cart, {
        method,
        idempotencyKey: idemRef.current,
        ...(phone.trim() ? { customerPhone: phone.trim() } : {}),
        ...(method === "cash" ? { cashTenderedCents: tenderCents } : {}),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.sale.status === "paid") {
        onPaid(res.sale);
      } else if (res.sale.status === "failed") {
        setError(res.sale.failureReason ?? "Payment failed.");
      } else {
        setPending(res.sale); // M-Pesa / Paystack — show the live panel
      }
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const res = await confirmSale(pending.saleId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.sale.status === "paid") onPaid(res.sale);
      else if (res.sale.status === "failed") setError(res.sale.failureReason ?? "Payment failed.");
      else setError("Still waiting for the customer to pay…");
    } finally {
      setBusy(false);
    }
  }

  // Live status panel (AC3): auto-poll confirm while a sale is pending so the
  // cashier doesn't have to tap. Caps out after ~1 minute; the manual "Check
  // status" button remains for an immediate check.
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    let attempts = 0;
    const handle = setInterval(async () => {
      attempts += 1;
      const res = await confirmSale(pending.saleId);
      if (cancelled) return;
      if (res.ok && res.sale.status === "paid") {
        clearInterval(handle);
        onPaid(res.sale);
      } else if (res.ok && res.sale.status === "failed") {
        clearInterval(handle);
        setError(res.sale.failureReason ?? "Payment failed.");
      } else if (attempts >= 20) {
        clearInterval(handle);
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [pending, onPaid]);

  return (
    <div role="dialog" aria-label="Take payment" className="flex flex-col gap-3 rounded-xl border border-ink/10 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Pay {formatKes(totalCents)}</h2>
        <button type="button" onClick={onCancel} className="touch-target rounded px-2 text-sm">
          ✕
        </button>
      </div>

      {!pending && (
        <>
          <div role="tablist" aria-label="Payment method" className="flex gap-2">
            {POS_PAY_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={method === m}
                onClick={() => pickMethod(m)}
                className={`touch-target rounded-lg border px-3 text-sm ${
                  method === m ? "border-brand bg-brand text-surface" : "border-ink/20"
                }`}
              >
                {methodLabel(m)}
              </button>
            ))}
          </div>

          {requiresCustomerPhone(method) && (
            <label className="flex flex-col gap-1 text-sm">
              Customer phone
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XX XXX XXX"
                className="touch-target rounded-lg border border-ink/20 px-3"
              />
            </label>
          )}

          {method === "cash" && (
            <div className="flex flex-col gap-1 text-sm">
              <label className="flex flex-col gap-1">
                Cash tendered (KES)
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={tender}
                  onChange={(e) => setTender(e.target.value)}
                  className="touch-target rounded-lg border border-ink/20 px-3"
                />
              </label>
              {tender !== "" && tenderOk && (
                <p className="text-ink/70">
                  Change: {formatKes(changeDueCents(totalCents, tenderCents))} · {drawerMessage(changeDueCents(totalCents, tenderCents))}
                </p>
              )}
            </div>
          )}

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="touch-target rounded-lg bg-brand px-4 font-medium text-surface disabled:opacity-50"
          >
            {busy ? "Processing…" : `Charge ${methodLabel(method)}`}
          </button>
        </>
      )}

      {pending && (
        <div className="flex flex-col gap-2" aria-label="Awaiting payment">
          {method === "mpesa" && (
            <p className="text-sm">
              STK push sent to <strong>{phone}</strong>. Ask the customer to enter their M-Pesa PIN,
              then tap “Check status”.
            </p>
          )}
          {method === "paystack" && pending.authorizationUrl && (
            <p className="text-sm">
              Open the checkout to pay by card:{" "}
              <a href={pending.authorizationUrl} target="_blank" rel="noreferrer" className="underline">
                {pending.authorizationUrl}
              </a>
              . Then tap “Check status”.
            </p>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            onClick={check}
            disabled={busy}
            className="touch-target rounded-lg bg-brand px-4 font-medium text-surface disabled:opacity-50"
          >
            {busy ? "Checking…" : "Check status"}
          </button>
        </div>
      )}
    </div>
  );
}
