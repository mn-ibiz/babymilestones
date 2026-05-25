/**
 * `ReceiptPreview` — reception receipt template (P1-E05-S06).
 *
 * Decision 13: printing is the browser's default print dialog, not a native
 * print server. So this module renders a self-contained, printable HTML
 * document from a {@link ReceiptPayload}; the Reception UI drops it into a
 * hidden iframe / new window and calls `window.print()`. No React dependency
 * (X7 primitives are not built yet) and no DOM, so it unit-tests as a pure
 * string function.
 *
 * This is the lightweight reception receipt — proof of payment for a parent.
 * The full eTIMS/KRA receipt engine (tax fields, control unit, QR, PDF) is a
 * separate epic (P1-E08) and is intentionally out of scope here.
 */
import type { ReceiptPayload } from "@bm/contracts";

/** Business name printed at the top of every receipt. */
export const RECEIPT_BUSINESS_NAME = "Baby Milestones";

/** Format integer cents to a KES money string (e.g. 50000 → "KES 500.00"). */
export function formatReceiptCents(cents: number): string {
  return `KES ${(cents / 100).toFixed(2)}`;
}

/** Date-only label (YYYY-MM-DD) for an ISO timestamp; raw string on parse fail. */
function dateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

/** Minimal HTML-escape for untrusted text interpolated into the template. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

/**
 * Render a browser-printable receipt document (AC2). Self-contained: inline
 * styles, no external assets, so it prints identically from an iframe/new
 * window. All interpolated text is HTML-escaped.
 */
export function renderReceiptHtml(receipt: ReceiptPayload): string {
  const rows = receipt.lineItems
    .map(
      (li) =>
        `<tr><td class="desc">${escapeHtml(li.description)}</td>` +
        `<td class="amt">${escapeHtml(formatReceiptCents(li.amountCents))}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(receipt.transactionId)}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #1a1a1a; max-width: 320px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; text-align: center; }
  .meta { font-size: 12px; color: #555; text-align: center; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 4px 0; }
  td.amt { text-align: right; }
  .total { border-top: 1px solid #1a1a1a; font-weight: 700; }
  .ref { font-size: 11px; color: #777; margin-top: 12px; word-break: break-all; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(RECEIPT_BUSINESS_NAME)}</h1>
  <div class="meta">
    ${escapeHtml(receipt.parentName)} · ${escapeHtml(receipt.parentPhone)}<br />
    ${escapeHtml(dateLabel(receipt.date))} · ${escapeHtml(receipt.method)} (${escapeHtml(receipt.source)})
  </div>
  <table>
    <tbody>
      ${rows}
      <tr class="total"><td class="desc">Total</td><td class="amt">${escapeHtml(
        formatReceiptCents(receipt.amountCents),
      )}</td></tr>
    </tbody>
  </table>
  <div class="ref">Ref: ${escapeHtml(receipt.transactionId)}</div>
</body>
</html>`;
}

/**
 * The SMS receipt copy (AC3) — a short transactional summary the parent keeps
 * as proof. Plain text, no HTML, kept compact.
 */
export function receiptSmsBody(receipt: ReceiptPayload): string {
  return (
    `${RECEIPT_BUSINESS_NAME} receipt: ${formatReceiptCents(receipt.amountCents)} ` +
    `(${receipt.method}) on ${dateLabel(receipt.date)}. Ref ${receipt.transactionId}.`
  );
}
