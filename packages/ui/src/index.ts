export { tokens, tailwindPreset } from "@bm/config";

// Reception receipt template (P1-E05-S06) — browser-printable HTML + SMS copy.
export {
  renderReceiptHtml,
  receiptSmsBody,
  formatReceiptCents,
  RECEIPT_BUSINESS_NAME,
} from "./receipt-preview.js";

// Full KRA-shaped receipt render (P1-E08-S03) — A4 HTML + 80mm thermal.
export {
  toReceiptDocument,
  renderReceipt,
  renderReceiptA4,
  renderReceiptThermal,
  receiptContentType,
  maskPhoneLast4,
  // formatReceiptCents already re-exported from receipt-preview (same impl).
  DEFAULT_BUSINESS_DETAILS,
  type ReceiptDocument,
  type ReceiptDocumentLine,
  type ReceiptRecordInput,
  type ReceiptRenderContext,
  type ReceiptBusinessDetails,
  type ReceiptFormat,
} from "./receipt-document.js";
