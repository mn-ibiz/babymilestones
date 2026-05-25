import { describe, expect, it } from "vitest";
import { BRAND } from "./index.js";
import { RECEIPT_BUSINESS_NAME, receiptSmsBody } from "../receipt-preview.js";
import { RECEIPT_BUSINESS_NAME as DOC_BUSINESS_NAME, DEFAULT_BUSINESS_DETAILS } from "../receipt-document.js";

/**
 * AC2: Receipt PDFs (E08) and SMS-stub bodies (E09) consume the SAME brand
 * strings — no duplicated literals. These assertions pin the shared source: if
 * someone re-introduces a literal, the brand name diverges and this fails.
 */
describe("brand single-source consumption (X7-S04 AC2)", () => {
  it("receipt-preview business name comes from the brand source", () => {
    expect(RECEIPT_BUSINESS_NAME).toBe(BRAND.name);
  });

  it("receipt-document business name + defaults come from the brand source", () => {
    expect(DOC_BUSINESS_NAME).toBe(BRAND.name);
    expect(DEFAULT_BUSINESS_DETAILS.name).toBe(BRAND.name);
  });

  it("a brand-name change is reflected by the SMS receipt body", () => {
    const body = receiptSmsBody({
      transactionId: "TX-1",
      parentName: "Asha",
      parentPhone: "+254700000000",
      lineItems: [{ description: "Wallet top-up", amountCents: 50000 }],
      amountCents: 50000,
      method: "mpesa",
      source: "stk",
      date: "2026-05-25T10:00:00.000Z",
    });
    // The SMS body must start with the shared brand name (no hardcoded literal).
    expect(body.startsWith(`${BRAND.name} receipt:`)).toBe(true);
  });
});
