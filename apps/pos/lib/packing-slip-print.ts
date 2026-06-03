import type { PackingSlip } from "@bm/contracts";
import { renderPackingSlipHtml } from "@bm/ui";

/**
 * POS packing-slip print path (Story 29.3 / P4-E04-S03).
 *
 * Decision 13 (AC3): printing is the browser's default print dialog, NOT a native
 * print server — so the rendered slip is pushed into a fresh print window and
 * `print()` is triggered, which sends it to the system DEFAULT printer. This
 * mirrors how the reception receipt prints (the receipt engine renders
 * self-contained HTML and the browser prints it — `@bm/ui` receipt-preview).
 *
 * The slip is rendered from the {@link PackingSlip} the card already holds (built
 * from the local `wc_orders` mirror), so there is NEVER a live Woo call at print
 * time (AC4) — this function takes a slip and renders, nothing more.
 *
 * Returns `true` once a print was dispatched; `false` when there is no window
 * (SSR) or a popup blocker denied the print window — the caller surfaces that.
 */
export function printPackingSlip(
  slip: PackingSlip,
  win: Window | undefined = typeof window === "undefined" ? undefined : window,
): boolean {
  if (!win) return false;

  const html = renderPackingSlipHtml(slip);
  // NOTE: do NOT pass `noopener`/`noreferrer` here — both make window.open()
  // return null (the opener handle is severed), so we could never write the slip
  // or call print(). We open a blank window and write our own document (no URL
  // navigation), so there is no cross-origin opener/referrer concern.
  const printWindow = win.open("", "_blank", "width=720,height=900");
  if (!printWindow) return false;

  const doc = printWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  printWindow.focus();
  printWindow.print();
  return true;
}
