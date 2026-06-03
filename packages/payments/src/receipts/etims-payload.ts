/**
 * eTIMS invoice payload builder + VAT computation (P5-E02-S01).
 *
 * Pure, dependency-free mapping from a {@link WriteReceiptPayload} to the eTIMS
 * invoice DTO that the adapter submits to KRA. Money is integer minor units (KES
 * cents); Kenyan standard VAT is 16%. VAT is computed VAT-INCLUSIVELY (the
 * displayed price already includes tax) and rounded to the nearest cent per
 * line, so the builder never drifts from the persisted line totals.
 */
import type { WriteReceiptPayload } from "./index.js";

/** Kenyan standard VAT rate in basis points (16% = 1600 bp). */
export const STANDARD_VAT_RATE_BP = 1600 as const;

/**
 * Extract the VAT contained in a VAT-inclusive gross amount (integer cents) at
 * the standard rate, rounded to the nearest cent. `gross * rate / (10000 + rate)`.
 */
export function computeLineVat(grossCents: number, rateBp: number = STANDARD_VAT_RATE_BP): number {
  if (grossCents <= 0) return 0;
  return Math.round((grossCents * rateBp) / (10000 + rateBp));
}

/** Seller identity the eTIMS invoice header must carry. */
export interface EtimsInvoiceSeller {
  pin: string;
  branchId: string;
  businessName: string;
  address: string;
}

/** One line on the eTIMS invoice. */
export interface EtimsInvoiceItem {
  /** Catalogue service / product reference (whichever the line set). */
  itemRef: string;
  quantity: number;
  /** Per-unit price, integer cents. */
  unitPrice: number;
  /** VAT for the line, integer cents. */
  taxAmount: number;
  /** Line total, integer cents. */
  totalAmount: number;
}

/** The eTIMS invoice DTO submitted to KRA. */
export interface EtimsInvoice {
  sellerPin: string;
  branchId: string;
  businessName: string;
  address: string;
  /** Our display receipt number, used as the invoice reference + idempotency key. */
  invoiceNumber: string;
  items: EtimsInvoiceItem[];
  /** Grand total, integer cents. */
  totalAmount: number;
  /** Total VAT, integer cents. */
  taxAmount: number;
}

/**
 * Build the eTIMS invoice from a receipt payload. The invoice number is the
 * caller-allocated display number (e.g. `BM-2026-000001`) so the eTIMS record
 * and our receipt share an identity — the idempotency key used on retries.
 *
 * The per-line VAT declared to KRA is the line's authoritative `lineTax` verbatim
 * — the same value computed from the line's tax_treatment (`computeLineTax`) and
 * persisted on the receipt. We do NOT re-derive VAT here: a `lineTax === 0` line
 * is the canonical encoding of an EXEMPT / ZERO-RATED supply, so fabricating 16%
 * on it would over-declare output VAT to KRA and make the fiscal declaration
 * disagree with both the persisted receipt (`taxTotal = Σ lineTax`) and the
 * printed receipt. Declare exactly what was charged.
 */
export function buildEtimsInvoice(
  seller: EtimsInvoiceSeller,
  payload: WriteReceiptPayload,
  invoiceNumber: string,
): EtimsInvoice {
  const items: EtimsInvoiceItem[] = payload.lines.map((line) => {
    const itemRef = line.serviceId ?? line.productId ?? "";
    return {
      itemRef,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxAmount: line.lineTax,
      totalAmount: line.lineTotal,
    };
  });

  const totalAmount = items.reduce((sum, i) => sum + i.totalAmount, 0);
  const taxAmount = items.reduce((sum, i) => sum + i.taxAmount, 0);

  return {
    sellerPin: seller.pin,
    branchId: seller.branchId,
    businessName: seller.businessName,
    address: seller.address,
    invoiceNumber,
    items,
    totalAmount,
    taxAmount,
  };
}
