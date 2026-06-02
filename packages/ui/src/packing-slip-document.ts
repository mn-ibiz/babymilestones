/**
 * `renderPackingSlipHtml` — the packing-slip render (Story 29.3 / P4-E04-S03).
 *
 * A DISTINCT template from the P1-E08 receipt engine (`./receipt-document`). It
 * REUSES the receipt render primitives — brand tokens from `@bm/config`, the
 * self-contained, dependency-light printable A4 HTML approach, and the same
 * HTML-escaping — but carries the packing facts a packer needs (AC2): the Woo
 * order number, customer name + phone, shipping address, delivery method, and the
 * line items + per-line QUANTITY (mandatory). It deliberately renders NO price
 * totals — a packing slip is not a receipt.
 *
 * Decision 13: printing is the browser's print dialog, not a native print server.
 * So this returns deterministic, self-contained HTML the POS drops into a fresh
 * print window and prints to the system DEFAULT printer. No React/DOM, so it
 * unit-tests as a pure string function.
 */
import { tokens } from "@bm/config";
import type { PackingSlip } from "@bm/contracts";
import { BRAND } from "./brand/index.js";

/** Minimal HTML-escape for untrusted text interpolated into the template. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

/** MIME content type for the rendered packing slip (printable HTML). */
export function packingSlipContentType(): string {
  return "text/html; charset=utf-8";
}

/**
 * Render the packing slip as a self-contained, printable A4 HTML document (AC2).
 * Brand colours from `@bm/config` tokens, an inline SVG logo mark (no external
 * assets) so it prints identically. All interpolated text is HTML-escaped. NO
 * price totals — only line items with their mandatory quantities.
 */
export function renderPackingSlipHtml(slip: PackingSlip): string {
  const brand = tokens.color.brand;
  const ink = tokens.color.ink;

  const rows = slip.items
    .map(
      (li) =>
        `<tr>` +
        `<td class="qty">${String(li.quantity)}</td>` +
        `<td class="desc">${escapeHtml(li.name)}</td>` +
        `</tr>`,
    )
    .join("");

  // Shipping address (AC2), or the Pickup-in-store fallback (test hint).
  const addressHtml = slip.pickupInStore
    ? `<div class="pickup">Pickup in store</div>`
    : slip.shippingAddress.map((l) => escapeHtml(l)).join("<br />");

  const customerLine = slip.customerName
    ? `${escapeHtml(slip.customerName)}${slip.customerPhone ? ` · ${escapeHtml(slip.customerPhone)}` : ""}`
    : slip.customerPhone
      ? escapeHtml(slip.customerPhone)
      : "";

  const noteBlock = slip.customerNote
    ? `<div class="note"><div class="note-label">Special instructions</div>${escapeHtml(slip.customerNote)}</div>`
    : "";

  // Inline brand logo mark — a simple branded SVG badge, no external asset.
  const logo =
    `<svg class="logo" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">` +
    `<circle cx="22" cy="22" r="22" fill="${escapeHtml(brand)}" />` +
    `<text x="22" y="28" text-anchor="middle" font-size="18" fill="#fff" font-family="system-ui, sans-serif">BM</text>` +
    `</svg>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Packing slip ${escapeHtml(slip.orderNumber)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, sans-serif; color: ${escapeHtml(ink)}; max-width: 720px; margin: 0 auto; padding: 24px; }
  header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid ${escapeHtml(brand)}; padding-bottom: 12px; margin-bottom: 16px; }
  .logo { flex: none; }
  h1 { font-size: 22px; margin: 0; color: ${escapeHtml(brand)}; }
  .slip-kind { font-size: 13px; color: #555; }
  .order { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
  .block { font-size: 13px; color: #333; margin-bottom: 16px; }
  .block-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #888; margin-bottom: 4px; }
  .pickup { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 16px; }
  th { text-align: left; border-bottom: 1px solid ${escapeHtml(ink)}; padding: 6px 0; }
  th.qty, td.qty { width: 48px; text-align: center; }
  td { padding: 8px 0; border-bottom: 1px solid #eee; }
  .note { font-size: 13px; color: #333; border: 1px solid ${escapeHtml(brand)}; border-radius: 6px; padding: 10px 12px; }
  .note-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: ${escapeHtml(brand)}; margin-bottom: 4px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <header>
    ${logo}
    <div>
      <h1>${escapeHtml(BRAND.name)}</h1>
      <div class="slip-kind">Packing slip</div>
    </div>
  </header>
  <div class="order">Order #${escapeHtml(slip.orderNumber)}</div>
  <div class="block">
    <div class="block-label">Ship to</div>
    ${customerLine ? `<div>${customerLine}</div>` : ""}
    ${addressHtml}
    <div>Delivery: ${escapeHtml(slip.deliveryMethod)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="qty">Qty</th>
        <th class="desc">Item</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  ${noteBlock}
</body>
</html>`;
}
