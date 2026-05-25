# P1-E08-S03 — Receipt render: review findings (follow-up log)

Single self-review completed. No BLOCKER/high-severity findings. Items below are
low-severity follow-ups intentionally deferred (not acted on further).

## Deferred (low severity)

1. **`ReceiptPreview` compound reuse (AC2).** The story suggests rendering through
   the `ReceiptPreview` compound for SMS/PDF consistency. That compound is an
   X7-S03 deliverable (`14-3-compound-components-for-p1-surfaces`, still
   `ready-for-dev`) and does not exist yet. The render was built as a sibling
   module in `@bm/ui` (`receipt-document.ts`) that shares conventions with the
   existing `receipt-preview.ts` (same `formatReceiptCents`, business name,
   HTML-escaping). When the compound lands, the A4 template can be re-homed onto
   it. No behavioural gap today.

2. **Thermal long-description clipping.** Very long service names are truncated to
   the 80mm column width rather than wrapped. Acceptable for receipt printers;
   revisit if multi-line item descriptions become common.

3. **Business details are static defaults.** `DEFAULT_BUSINESS_DETAILS` (address,
   hotline, KRA PIN) are hard-coded constants. When an admin settings table for
   business identity exists (P1-E10-S04), the route should source them from there
   and pass via `ReceiptRenderContext.business` (already supported).
