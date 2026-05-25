import { describe, expect, it } from "vitest";
import type { ReceiptPayload } from "@bm/contracts";
import {
  renderReceiptHtml,
  receiptSmsBody,
  formatReceiptCents,
  RECEIPT_BUSINESS_NAME,
} from "./receipt-preview.js";

function payload(over: Partial<ReceiptPayload> = {}): ReceiptPayload {
  return {
    transactionId: "5d2a0c8e-0000-4000-8000-000000000001",
    parentName: "Asha Mwangi",
    parentPhone: "+254712345678",
    lineItems: [{ description: "Wallet top-up", amountCents: 50_000 }],
    amountCents: 50_000,
    method: "topup",
    source: "cash:reception",
    date: "2026-02-03T09:30:00.000Z",
    ...over,
  };
}

describe("formatReceiptCents (P1-E05-S06)", () => {
  it("formats integer cents to KES with two decimals", () => {
    expect(formatReceiptCents(50_000)).toBe("KES 500.00");
    expect(formatReceiptCents(-20_000)).toBe("KES -200.00");
    expect(formatReceiptCents(0)).toBe("KES 0.00");
  });
});

describe("renderReceiptHtml (P1-E05-S06 AC2 — browser-printable, Decision 13)", () => {
  it("renders a self-contained HTML document with the receipt facts", () => {
    const html = renderReceiptHtml(payload());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain(RECEIPT_BUSINESS_NAME);
    expect(html).toContain("Asha Mwangi");
    expect(html).toContain("Wallet top-up");
    expect(html).toContain("KES 500.00");
    // The transaction id is the receipt reference.
    expect(html).toContain("5d2a0c8e-0000-4000-8000-000000000001");
    // A date label (not the raw ISO string with time).
    expect(html).toContain("2026-02-03");
  });

  it("renders one row per line item", () => {
    const html = renderReceiptHtml(
      payload({
        lineItems: [
          { description: "Wallet top-up", amountCents: 50_000 },
          { description: "Service charge", amountCents: -20_000 },
        ],
        amountCents: 30_000,
      }),
    );
    expect(html).toContain("Wallet top-up");
    expect(html).toContain("Service charge");
    expect(html).toContain("KES -200.00");
  });

  it("escapes HTML in untrusted fields (no injection from a name)", () => {
    const html = renderReceiptHtml(payload({ parentName: "<script>x</script>" }));
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("receiptSmsBody (P1-E05-S06 AC3 — the SMS copy)", () => {
  it("is a short transactional summary the parent can keep as proof", () => {
    const body = receiptSmsBody(payload());
    expect(body).toContain(RECEIPT_BUSINESS_NAME);
    expect(body).toContain("KES 500.00");
    expect(body).toContain("2026-02-03");
    // SMS stays short — single segment-ish, no HTML.
    expect(body).not.toContain("<");
    expect(body.length).toBeLessThanOrEqual(320);
  });
});
