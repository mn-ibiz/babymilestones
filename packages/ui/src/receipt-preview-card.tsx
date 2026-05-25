/**
 * `ReceiptPreview` (X7-S03) — an on-screen receipt preview card rendered from a
 * typed {@link ReceiptDocument} (the same shaped, phone-masked model the
 * server-side A4/thermal templates consume, from `./receipt-document`). It only
 * ever renders the masked phone (`maskedPhone`) — the full number is never
 * surfaced. Money is integer cents, formatted with {@link formatReceiptCents}.
 * Composed from brand tokens; this is the screen preview, distinct from the
 * print/SMS renders in `./receipt-document` and `./receipt-preview`.
 */
import * as React from "react";
import { cn } from "./cn.js";
import {
  formatReceiptCents,
  type ReceiptDocument,
} from "./receipt-document.js";

export interface ReceiptPreviewProps
  extends React.HTMLAttributes<HTMLDivElement> {
  receipt: ReceiptDocument;
}

export const ReceiptPreview = React.forwardRef<
  HTMLDivElement,
  ReceiptPreviewProps
>(function ReceiptPreview({ receipt, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-neutral-200 bg-white p-4 text-neutral-900 shadow-sm",
        className,
      )}
      {...rest}
    >
      <header className="border-b border-neutral-200 pb-2 text-center">
        <div className="text-base font-semibold">{receipt.business.name}</div>
        <div className="text-xs text-neutral-500">{receipt.displayNumber}</div>
      </header>

      <table className="mt-3 w-full text-sm">
        <tbody>
          {receipt.lines.map((line, i) => (
            <tr key={i}>
              <td className="py-1">{line.description}</td>
              <td className="py-1 text-right tabular-nums">
                {formatReceiptCents(line.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-neutral-200 font-semibold">
            <td className="pt-2">Total</td>
            <td className="pt-2 text-right tabular-nums">
              {formatReceiptCents(receipt.total)}
            </td>
          </tr>
        </tfoot>
      </table>

      <footer className="mt-3 space-y-0.5 text-xs text-neutral-500">
        <div>Paid by {receipt.paymentMethod}</div>
        {receipt.customerName ? <div>{receipt.customerName}</div> : null}
        {receipt.maskedPhone ? <div>{receipt.maskedPhone}</div> : null}
      </footer>
    </div>
  );
});
