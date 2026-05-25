export { tokens, tailwindPreset } from "@bm/config";

// Reception receipt template (P1-E05-S06) — browser-printable HTML + SMS copy.
export {
  renderReceiptHtml,
  receiptSmsBody,
  formatReceiptCents,
  RECEIPT_BUSINESS_NAME,
} from "./receipt-preview.js";
