/**
 * `ReceiptDocument` — the KRA-shaped receipt render (P1-E08-S03).
 *
 * This is the *full* receipt-engine render (epic P1-E08), distinct from the
 * lightweight reception receipt in {@link ./receipt-preview}. It renders a
 * persisted receipt record (the `receipts` + `receipt_lines` shape written by
 * the P1-E08-S02 writer) to two server-side templates:
 *
 *   - **A4** — a branded, self-contained printable HTML document. Decision 13:
 *     printing is the browser's print dialog, not a native PDF/print server, so
 *     the API returns deterministic HTML the browser prints to A4. Dependency-
 *     light: inline styles, brand tokens from `@bm/config`, no React/DOM, so it
 *     unit-tests as a pure string function.
 *   - **thermal** — an 80mm receipt printer layout: plain text, fixed-width
 *     columns, no HTML reliance (Dev Notes).
 *
 * Both templates carry the same facts (AC3): business details, the display
 * sequence number (`<series>-<seq>`), date, line items, totals, payment method,
 * and the customer phone **masked to the last 4 digits** — the full number is
 * never rendered. Money is integer minor units (KES cents), matching the schema.
 */
import { tokens } from "@bm/config";
import { BRAND } from "./brand/index.js";

/** Business name printed at the top of every receipt — from the brand source (X7-S04). */
export const RECEIPT_BUSINESS_NAME = BRAND.name;

/** Static business details printed on the full receipt (AC3). */
export interface ReceiptBusinessDetails {
  name: string;
  addressLines: string[];
  /** Contact phone / hotline shown in the footer. */
  phone: string;
  /** Optional KRA PIN line (filled once eTIMS adoption lands). */
  kraPin?: string | null;
  /**
   * VAT registration number recorded once in Settings → Tax (P5-E02-S04). Shown
   * in the footer tax block when present.
   */
  vatRegistrationNumber?: string | null;
  /**
   * Registered business address recorded in Settings → Tax (P5-E02-S04). Shown
   * in the footer tax block when present (distinct from the display
   * `addressLines` header lines).
   */
  registeredAddress?: string | null;
}

/** Default business details — overridable by the caller/route. */
export const DEFAULT_BUSINESS_DETAILS: ReceiptBusinessDetails = {
  name: RECEIPT_BUSINESS_NAME,
  addressLines: ["Nairobi, Kenya"],
  phone: BRAND.supportPhone,
  kraPin: null,
  vatRegistrationNumber: null,
  registeredAddress: null,
};

/** One line on the full receipt. Money is integer cents. */
export interface ReceiptDocumentLine {
  description: string;
  quantity: number;
  /** Per-unit price, integer cents. */
  unitPrice: number;
  /** VAT for this line, integer cents. */
  lineTax: number;
  /** Line total, integer cents. */
  lineTotal: number;
}

/**
 * The catalogue facts a receipt line needs to compute its display description
 * (P5-E01-S05 / Story 31.5). The real line keeps its `serviceId`; only the
 * rendered description changes when discreet billing is enabled.
 */
export interface ReceiptLineServiceInfo {
  /** The line's service id (null for a product line). */
  serviceId: string | null;
  /** The real catalogue service name (null when no service / unnamed). */
  serviceName: string | null;
  /** Discreet-billing toggle on the service (P5-E01-S05 AC3). */
  discreetBillingEnabled: boolean;
  /** Neutral display label to show when discreet billing is enabled (AC1). */
  discreetBillingLabel: string | null;
}

/**
 * The SINGLE chokepoint that turns a receipt line's catalogue facts into the
 * description shown on the receipt (P5-E01-S05 AC1). When discreet billing is
 * enabled AND a non-blank label is set, the NEUTRAL label is rendered instead of
 * the real, sensitive service name — every amount/VAT stays identical (this only
 * changes the text). Otherwise it preserves the existing behaviour: the real
 * service name, or the generic `Service` / `Item` fallbacks for an unnamed
 * service / a product line. Pure + display-only — the stored line is untouched.
 */
export function receiptLineDescription(info: ReceiptLineServiceInfo): string {
  if (info.discreetBillingEnabled) {
    const label = (info.discreetBillingLabel ?? "").trim();
    if (label !== "") return label;
  }
  return info.serviceName ?? (info.serviceId ? "Service" : "Item");
}

/**
 * The receipt render model — everything a template needs, already shaped and
 * phone-masked. Built from a persisted receipt record by {@link toReceiptDocument}.
 */
export interface ReceiptDocument {
  /** Display sequence, e.g. `BM-2026-000123`. */
  displayNumber: string;
  /** ISO timestamp the receipt was created. */
  date: string;
  paymentMethod: string;
  /** Customer phone **masked to the last 4 digits** (e.g. `••••5678`), or null. */
  maskedPhone: string | null;
  customerName: string | null;
  lines: ReceiptDocumentLine[];
  /** Grand total, integer cents. */
  total: number;
  /** Tax total, integer cents. */
  taxTotal: number;
  business: ReceiptBusinessDetails;
}

/** The persisted-receipt fields this render needs (subset of @bm/payments `Receipt`). */
export interface ReceiptRecordInput {
  displayNumber: string;
  paymentMethod: string;
  total: number;
  taxTotal: number;
  createdAt: Date | string;
  lines: ReceiptDocumentLine[];
}

/** Extra, non-record context the templates need (customer identity + business). */
export interface ReceiptRenderContext {
  customerName?: string | null;
  customerPhone?: string | null;
  business?: ReceiptBusinessDetails;
}

/** Format integer cents to a KES money string (e.g. 50000 → "KES 500.00"). */
export function formatReceiptCents(cents: number): string {
  return `KES ${(cents / 100).toFixed(2)}`;
}

/**
 * Mask a phone to its last 4 digits — the only customer-phone form a receipt
 * may render (AC3, Dev Notes: never render the full number). Non-digits are
 * dropped before masking; fewer than 4 digits masks what is present. Returns
 * null for empty/nullish input.
 */
export function maskPhoneLast4(phone: string | null | undefined): string | null {
  if (phone == null) return null;
  const digits = phone.replace(/\D/gu, "");
  if (digits.length === 0) return null;
  const last4 = digits.slice(-4);
  return `${"•".repeat(4)}${last4}`;
}

/** Date-only label (YYYY-MM-DD) for an ISO timestamp; raw string on parse fail. */
function dateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

/** Minimal HTML-escape for untrusted text interpolated into the A4 template. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

/**
 * Build the {@link ReceiptDocument} render model from a persisted receipt record
 * + render context. Masks the phone to last 4 here so no template ever sees the
 * full number.
 */
export function toReceiptDocument(
  record: ReceiptRecordInput,
  ctx: ReceiptRenderContext = {},
): ReceiptDocument {
  return {
    displayNumber: record.displayNumber,
    date: typeof record.createdAt === "string" ? record.createdAt : record.createdAt.toISOString(),
    paymentMethod: record.paymentMethod,
    maskedPhone: maskPhoneLast4(ctx.customerPhone),
    customerName: ctx.customerName ?? null,
    lines: record.lines,
    total: record.total,
    taxTotal: record.taxTotal,
    business: ctx.business ?? DEFAULT_BUSINESS_DETAILS,
  };
}

/** Supported render formats. `a4` → branded HTML; `thermal` → 80mm plain text. */
export type ReceiptFormat = "a4" | "thermal";

/** MIME content type for a rendered format (used by the API route). */
export function receiptContentType(format: ReceiptFormat): string {
  return format === "a4" ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
}

/**
 * Render the A4 branded HTML document (AC1, AC2, AC3). Self-contained: brand
 * colours from `@bm/config` tokens, an inline SVG logo mark (no external
 * assets), so it prints identically. All interpolated text is HTML-escaped.
 */
export function renderReceiptA4(doc: ReceiptDocument): string {
  const brand = tokens.color.brand;
  const ink = tokens.color.ink;

  const rows = doc.lines
    .map(
      (li) =>
        `<tr>` +
        `<td class="desc">${escapeHtml(li.description)}</td>` +
        `<td class="qty">${String(li.quantity)}</td>` +
        `<td class="amt">${escapeHtml(formatReceiptCents(li.unitPrice))}</td>` +
        `<td class="amt">${escapeHtml(formatReceiptCents(li.lineTax))}</td>` +
        `<td class="amt">${escapeHtml(formatReceiptCents(li.lineTotal))}</td>` +
        `</tr>`,
    )
    .join("");

  const addressHtml = doc.business.addressLines
    .map((l) => escapeHtml(l))
    .join("<br />");

  const customerLine = doc.customerName
    ? `<div class="cust">${escapeHtml(doc.customerName)}${
        doc.maskedPhone ? ` · ${escapeHtml(doc.maskedPhone)}` : ""
      }</div>`
    : doc.maskedPhone
      ? `<div class="cust">${escapeHtml(doc.maskedPhone)}</div>`
      : "";

  const kraLine = doc.business.kraPin
    ? `<div class="kra">KRA PIN: ${escapeHtml(doc.business.kraPin)}</div>`
    : "";

  // P5-E02-S04: VAT-registration footer block — each line emitted only when the
  // metadata is present (so a bare receipt omits the block cleanly).
  const vatFooterA4 = [
    doc.business.vatRegistrationNumber
      ? `VAT Reg No: ${escapeHtml(doc.business.vatRegistrationNumber)}`
      : "",
    doc.business.registeredAddress ? escapeHtml(doc.business.registeredAddress) : "",
  ]
    .filter(Boolean)
    .map((line) => `  <div class="footer">${line}</div>`)
    .join("\n");

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
<title>Receipt ${escapeHtml(doc.displayNumber)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, sans-serif; color: ${escapeHtml(ink)}; max-width: 720px; margin: 0 auto; padding: 24px; }
  header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid ${escapeHtml(brand)}; padding-bottom: 12px; margin-bottom: 16px; }
  .logo { flex: none; }
  h1 { font-size: 22px; margin: 0; color: ${escapeHtml(brand)}; }
  .biz { font-size: 12px; color: #555; }
  .seq { font-size: 14px; font-weight: 700; }
  .meta { font-size: 13px; color: #333; margin-bottom: 16px; display: flex; justify-content: space-between; }
  .cust { font-size: 13px; color: #333; margin-bottom: 8px; }
  .kra { font-size: 12px; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px; }
  th { text-align: left; border-bottom: 1px solid ${escapeHtml(ink)}; padding: 6px 0; }
  th.amt, td.amt, th.qty, td.qty { text-align: right; }
  td { padding: 6px 0; }
  tfoot td { border-top: 1px solid ${escapeHtml(ink)}; font-weight: 700; padding-top: 8px; }
  .footer { font-size: 11px; color: #777; margin-top: 24px; text-align: center; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <header>
    ${logo}
    <div>
      <h1>${escapeHtml(doc.business.name)}</h1>
      <div class="biz">${addressHtml}<br />${escapeHtml(doc.business.phone)}</div>
      ${kraLine}
    </div>
  </header>
  <div class="meta">
    <span class="seq">Receipt ${escapeHtml(doc.displayNumber)}</span>
    <span>${escapeHtml(dateLabel(doc.date))} · ${escapeHtml(doc.paymentMethod)}</span>
  </div>
  ${customerLine}
  <table>
    <thead>
      <tr>
        <th class="desc">Item</th>
        <th class="qty">Qty</th>
        <th class="amt">Unit</th>
        <th class="amt">VAT</th>
        <th class="amt">Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr><td>VAT</td><td></td><td></td><td></td><td class="amt">${escapeHtml(
        formatReceiptCents(doc.taxTotal),
      )}</td></tr>
      <tr><td>Total</td><td></td><td></td><td></td><td class="amt">${escapeHtml(
        formatReceiptCents(doc.total),
      )}</td></tr>
    </tfoot>
  </table>
  <div class="footer">Thank you for choosing ${escapeHtml(doc.business.name)}.</div>${vatFooterA4 ? `\n${vatFooterA4}` : ""}
</body>
</html>`;
}

/** Width (chars) of the 80mm thermal column layout — fits a standard 80mm head. */
const THERMAL_WIDTH = 40;

/** Pad/truncate a string into a fixed-width left-aligned cell. */
function padRight(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width, " ");
}

/** Center a label within the thermal width. */
function center(value: string): string {
  const v = value.length > THERMAL_WIDTH ? value.slice(0, THERMAL_WIDTH) : value;
  const pad = Math.floor((THERMAL_WIDTH - v.length) / 2);
  return " ".repeat(Math.max(0, pad)) + v;
}

/** A description + right-aligned amount line at the full thermal width. */
function descAmount(desc: string, amount: string): string {
  const amt = amount.length > THERMAL_WIDTH ? amount.slice(0, THERMAL_WIDTH) : amount;
  const descWidth = THERMAL_WIDTH - amt.length - 1;
  return `${padRight(desc, Math.max(0, descWidth))} ${amt}`;
}

/**
 * Render the 80mm thermal receipt (AC1, AC3). Plain text only, fixed-width
 * columns — no HTML reliance (Dev Notes). Carries the same facts as the A4
 * template, with the phone masked to the last 4 digits.
 */
export function renderReceiptThermal(doc: ReceiptDocument): string {
  const rule = "-".repeat(THERMAL_WIDTH);
  const out: string[] = [];

  out.push(center(doc.business.name));
  for (const line of doc.business.addressLines) out.push(center(line));
  out.push(center(doc.business.phone));
  if (doc.business.kraPin) out.push(center(`KRA PIN: ${doc.business.kraPin}`));
  // P5-E02-S04: VAT-registration footer lines (emitted only when present).
  if (doc.business.vatRegistrationNumber)
    out.push(center(`VAT Reg No: ${doc.business.vatRegistrationNumber}`));
  if (doc.business.registeredAddress) out.push(center(doc.business.registeredAddress));
  out.push(rule);
  out.push(`Receipt: ${doc.displayNumber}`);
  out.push(`Date:    ${dateLabel(doc.date)}`);
  out.push(`Method:  ${doc.paymentMethod}`);
  if (doc.customerName) out.push(`Name:    ${doc.customerName}`);
  if (doc.maskedPhone) out.push(`Phone:   ${doc.maskedPhone}`);
  out.push(rule);

  for (const li of doc.lines) {
    out.push(descAmount(li.description, formatReceiptCents(li.lineTotal)));
    out.push(`  ${li.quantity} x ${formatReceiptCents(li.unitPrice)}`);
  }

  out.push(rule);
  out.push(descAmount("VAT", formatReceiptCents(doc.taxTotal)));
  out.push(descAmount("TOTAL", formatReceiptCents(doc.total)));
  out.push(rule);
  out.push(center(`Thank you!`));

  return `${out.join("\n")}\n`;
}

/** Render a receipt document to the requested format. */
export function renderReceipt(doc: ReceiptDocument, format: ReceiptFormat): string {
  return format === "a4" ? renderReceiptA4(doc) : renderReceiptThermal(doc);
}
