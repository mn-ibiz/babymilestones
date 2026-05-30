"use client";

import { useState } from "react";
import type { PosSaleResponse } from "@bm/contracts";
import { ProductSearch } from "./ProductSearch";
import { Cart } from "./Cart";
import { PayPanel } from "./PayPanel";
import { addProduct, computeTotals, emptyCart, type Cart as CartModel } from "../../lib/cart";
import { formatKes } from "../../lib/products";

interface PrintableReceipt {
  receiptNumber?: string;
  lines: { name: string; qty: number; grossCents: number }[];
  totalCents: number;
  changeCents?: number;
}

/**
 * Active-sale canvas (P2-E04 S01–S04). A product pane on the left (scan +
 * search — S02) and the live cart on the right (lines, discounts, totals, stock
 * check — S03). Tapping Pay (with stock OK) opens the payment panel (S04); on a
 * paid sale the cart clears, a confirmation shows, and the receipt can be sent
 * to the default printer (AC6).
 */
export function SaleScreen({ canTakePayment = true }: { canTakePayment?: boolean }) {
  const [cart, setCart] = useState<CartModel>(emptyCart);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<PrintableReceipt | null>(null);

  const totals = computeTotals(cart);

  function onPaid(sale: PosSaleResponse) {
    // Snapshot the sold lines for the printable receipt before clearing the cart.
    setReceipt({
      receiptNumber: sale.receiptNumber,
      lines: totals.lines.map((l) => ({ name: l.name, qty: l.qty, grossCents: l.grossCents })),
      totalCents: sale.totalCents,
      changeCents: sale.changeCents,
    });
    setPaying(false);
    setCart(emptyCart);
  }

  return (
    <div className="grid h-full grid-cols-[1fr_minmax(320px,28rem)] gap-4 p-4">
      <section aria-label="Products" className="rounded-xl border border-ink/10 p-4">
        <h1 className="text-lg font-semibold">New sale</h1>
        <p className="mb-3 mt-1 text-sm text-ink/60">Scan or search a product to begin.</p>
        {receipt && (
          <div role="status" className="mb-3 flex items-center justify-between rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            <span>
              Sale complete — receipt {receipt.receiptNumber}
              {receipt.changeCents ? ` · change ${formatKes(receipt.changeCents)}` : ""}.
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="touch-target rounded-lg border border-success px-3 text-success"
            >
              Print receipt
            </button>
          </div>
        )}
        <ProductSearch
          onAdd={(p) => {
            setReceipt(null);
            setCart((c) => addProduct(c, p));
          }}
        />
      </section>

      <aside aria-label="Order summary" className="rounded-xl border border-ink/10 p-4">
        {paying ? (
          <PayPanel
            cart={cart}
            totalCents={totals.grandTotalCents}
            onPaid={onPaid}
            onCancel={() => setPaying(false)}
          />
        ) : (
          <Cart
            cart={cart}
            onChange={setCart}
            onProceed={() => setPaying(true)}
            canPay={canTakePayment}
          />
        )}
      </aside>

      {/* Print-only receipt — hidden on screen, sent to the default printer (AC6). */}
      {receipt && (
        <div id="pos-receipt-print" aria-hidden>
          <h2>Baby Milestones</h2>
          <p>Receipt {receipt.receiptNumber}</p>
          <ul>
            {receipt.lines.map((l, i) => (
              <li key={i}>
                {l.qty} × {l.name} — {formatKes(l.grossCents)}
              </li>
            ))}
          </ul>
          <p>Total: {formatKes(receipt.totalCents)}</p>
          {receipt.changeCents ? <p>Change: {formatKes(receipt.changeCents)}</p> : null}
          <p>Thank you!</p>
        </div>
      )}
    </div>
  );
}
