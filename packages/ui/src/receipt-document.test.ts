import { describe, expect, it } from "vitest";
import { tokens } from "@bm/config";
import {
  DEFAULT_BUSINESS_DETAILS,
  maskPhoneLast4,
  receiptContentType,
  renderReceipt,
  renderReceiptA4,
  renderReceiptThermal,
  toReceiptDocument,
  type ReceiptDocument,
  type ReceiptRecordInput,
} from "./receipt-document.js";

function record(over: Partial<ReceiptRecordInput> = {}): ReceiptRecordInput {
  return {
    displayNumber: "BM-2026-000123",
    paymentMethod: "mpesa",
    total: 150_000,
    taxTotal: 20_690,
    createdAt: new Date("2026-02-03T09:30:00.000Z"),
    lines: [
      { description: "Soft-play session", quantity: 2, unitPrice: 50_000, lineTax: 13_793, lineTotal: 100_000 },
      { description: "Smoothie", quantity: 1, unitPrice: 50_000, lineTax: 6_897, lineTotal: 50_000 },
    ],
    ...over,
  };
}

function doc(over: Partial<ReceiptDocument> = {}): ReceiptDocument {
  return {
    ...toReceiptDocument(record(), {
      customerName: "Asha Mwangi",
      customerPhone: "+254712345678",
    }),
    ...over,
  };
}

describe("maskPhoneLast4 (P1-E08-S03 AC3 — never render the full number)", () => {
  it("masks all but the last 4 digits", () => {
    expect(maskPhoneLast4("+254712345678")).toBe("••••5678");
  });

  it("strips non-digits before masking", () => {
    expect(maskPhoneLast4("0712 345 678")).toBe("••••5678");
  });

  it("never contains the leading digits of the input", () => {
    const masked = maskPhoneLast4("+254712345678");
    expect(masked).not.toContain("254712");
    expect(masked).not.toContain("2543");
  });

  it("returns null for empty / nullish input", () => {
    expect(maskPhoneLast4(null)).toBeNull();
    expect(maskPhoneLast4(undefined)).toBeNull();
    expect(maskPhoneLast4("")).toBeNull();
    expect(maskPhoneLast4("---")).toBeNull();
  });
});

describe("toReceiptDocument (P1-E08-S03)", () => {
  it("masks the phone in the render model", () => {
    const d = toReceiptDocument(record(), { customerPhone: "+254712345678" });
    expect(d.maskedPhone).toBe("••••5678");
  });

  it("carries the display sequence number and totals", () => {
    const d = toReceiptDocument(record());
    expect(d.displayNumber).toBe("BM-2026-000123");
    expect(d.total).toBe(150_000);
    expect(d.taxTotal).toBe(20_690);
  });

  it("falls back to default business details", () => {
    const d = toReceiptDocument(record());
    expect(d.business).toEqual(DEFAULT_BUSINESS_DETAILS);
  });
});

describe("renderReceiptA4 (P1-E08-S03 AC1, AC2, AC3 — branded server-side HTML)", () => {
  it("renders a self-contained A4 HTML document with the receipt facts", () => {
    const html = renderReceiptA4(doc());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("@page { size: A4");
    expect(html).toContain(DEFAULT_BUSINESS_DETAILS.name);
    expect(html).toContain("BM-2026-000123");
    expect(html).toContain("2026-02-03");
    expect(html).toContain("mpesa");
    expect(html).toContain("Soft-play session");
    expect(html).toContain("Smoothie");
    expect(html).toContain("KES 1500.00"); // total
    expect(html).toContain("KES 206.90"); // tax total
  });

  it("applies brand colours from @bm/config tokens (AC2)", () => {
    const html = renderReceiptA4(doc());
    expect(html).toContain(tokens.color.brand);
    expect(html).toContain(tokens.color.ink);
    // Branded logo mark is inlined (no external asset).
    expect(html).toContain("<svg");
  });

  it("renders only the masked phone, never the full number (AC3)", () => {
    const html = renderReceiptA4(doc());
    expect(html).toContain("••••5678");
    expect(html).not.toContain("+254712345678");
    expect(html).not.toContain("254712345678");
  });

  it("escapes HTML in untrusted fields (no injection from a name)", () => {
    const d = toReceiptDocument(record(), { customerName: "<script>x</script>" });
    const html = renderReceiptA4(d);
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderReceiptThermal (P1-E08-S03 AC1, AC3 — 80mm plain text)", () => {
  it("renders fixed-width plain text with no HTML", () => {
    const text = renderReceiptThermal(doc());
    expect(text).not.toContain("<");
    expect(text).toContain(DEFAULT_BUSINESS_DETAILS.name);
    expect(text).toContain("BM-2026-000123");
    expect(text).toContain("2026-02-03");
    expect(text).toContain("mpesa");
    expect(text).toContain("Soft-play session");
    expect(text).toContain("KES 1500.00");
    expect(text).toContain("KES 206.90");
  });

  it("keeps every line within the 80mm column width", () => {
    const text = renderReceiptThermal(doc());
    for (const line of text.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it("renders only the masked phone, never the full number (AC3)", () => {
    const text = renderReceiptThermal(doc());
    expect(text).toContain("••••5678");
    expect(text).not.toContain("+254712345678");
    expect(text).not.toContain("254712345678");
  });
});

describe("renderReceipt + receiptContentType (P1-E08-S03)", () => {
  it("dispatches by format", () => {
    expect(renderReceipt(doc(), "a4")).toContain("<!DOCTYPE html>");
    expect(renderReceipt(doc(), "thermal")).not.toContain("<");
  });

  it("maps formats to content types", () => {
    expect(receiptContentType("a4")).toBe("text/html; charset=utf-8");
    expect(receiptContentType("thermal")).toBe("text/plain; charset=utf-8");
  });
});
