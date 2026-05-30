import { describe, expect, it } from "vitest";
import {
  STANDARD_VAT_RATE_BP,
  buildEtimsInvoice,
  computeLineVat,
} from "./etims-payload.js";
import type { WriteReceiptPayload } from "./index.js";

/**
 * P5-E02-S01 — eTIMS payload builder + VAT computation (pure, unit-tested).
 *
 * Money is integer minor units (KES cents). Kenya standard VAT is 16% (1600
 * basis points). VAT is computed VAT-inclusively per line then summed, so the
 * builder never drifts from the persisted line totals (no float).
 */
describe("eTIMS VAT computation (P5-E02-S01)", () => {
  it("uses the Kenyan 16% standard rate (1600 bp)", () => {
    expect(STANDARD_VAT_RATE_BP).toBe(1600);
  });

  it("extracts VAT from a VAT-inclusive gross at 16% (integer cents, rounded)", () => {
    // 11600 cents gross @16% inclusive → tax = 11600 * 16 / 116 = 1600.
    expect(computeLineVat(11600)).toBe(1600);
  });

  it("rounds to the nearest cent (no float drift)", () => {
    // 100 cents gross @16% inclusive → 100*16/116 = 13.79… → 14.
    expect(computeLineVat(100)).toBe(14);
  });

  it("returns 0 for a zero-value line", () => {
    expect(computeLineVat(0)).toBe(0);
  });
});

describe("eTIMS invoice builder (P5-E02-S01)", () => {
  const seller = {
    pin: "P051234567A",
    branchId: "00",
    businessName: "BM Ltd",
    address: "Nairobi",
  };

  const payload: WriteReceiptPayload = {
    series: "BM-2026",
    paymentMethod: "cash",
    postedBy: "cashier-1",
    lines: [
      { serviceId: "svc-1", quantity: 2, unitPrice: 5800, lineTax: 1600, lineTotal: 11600 },
      { productId: "prd-1", quantity: 1, unitPrice: 2320, lineTax: 320, lineTotal: 2320 },
    ],
  };

  it("maps each receipt line to an invoice item with ref + amounts", () => {
    const invoice = buildEtimsInvoice(seller, payload, "BM-2026-000001");
    expect(invoice.items).toHaveLength(2);
    expect(invoice.items[0]).toMatchObject({
      itemRef: "svc-1",
      quantity: 2,
      unitPrice: 5800,
      taxAmount: 1600,
      totalAmount: 11600,
    });
    expect(invoice.items[1]).toMatchObject({ itemRef: "prd-1", quantity: 1 });
  });

  it("stamps the seller PIN, branch, and invoice number on the header", () => {
    const invoice = buildEtimsInvoice(seller, payload, "BM-2026-000001");
    expect(invoice.sellerPin).toBe("P051234567A");
    expect(invoice.branchId).toBe("00");
    expect(invoice.invoiceNumber).toBe("BM-2026-000001");
  });

  it("totals the lines: grand total and tax total equal the sum of lines", () => {
    const invoice = buildEtimsInvoice(seller, payload, "BM-2026-000001");
    expect(invoice.totalAmount).toBe(11600 + 2320);
    expect(invoice.taxAmount).toBe(1600 + 320);
  });

  it("derives line tax when a line omits it (VAT-inclusive at 16%)", () => {
    const noTax: WriteReceiptPayload = {
      series: "BM-2026",
      paymentMethod: "cash",
      postedBy: "cashier-1",
      lines: [{ serviceId: "svc-1", quantity: 1, unitPrice: 11600, lineTax: 0, lineTotal: 11600 }],
    };
    const invoice = buildEtimsInvoice(seller, noTax, "BM-2026-000002", { deriveTax: true });
    expect(invoice.items[0]!.taxAmount).toBe(1600);
    expect(invoice.taxAmount).toBe(1600);
  });
});
