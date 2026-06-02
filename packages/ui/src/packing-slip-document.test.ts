import { describe, expect, it } from "vitest";
import type { PackingSlip } from "@bm/contracts";
import {
  packingSlipContentType,
  renderPackingSlipHtml,
} from "./packing-slip-document.js";

/**
 * Story 29.3 (P4-E04-S03) — the packing-slip render. A DISTINCT template from the
 * P1-E08 receipt engine (it reuses the receipt render primitives — brand tokens,
 * the self-contained printable A4 HTML, HTML-escaping — but carries NO price
 * totals; quantity is mandatory). Self-contained HTML so the POS can drop it into
 * a hidden iframe / new window and print it to the system default printer
 * (Decision 13). Rendered as a pure string function — no DOM.
 */
function slip(over: Partial<PackingSlip> = {}): PackingSlip {
  return {
    orderNumber: "1001",
    customerName: "Asha Otieno",
    customerPhone: "+254712345678",
    shippingAddress: ["12 Riverside Drive", "Apt 4B", "Nairobi, Nairobi 00100", "KE"],
    deliveryMethod: "Boda delivery",
    items: [
      { name: "Baby carrier", quantity: 2 },
      { name: "Muslin wrap", quantity: 3 },
    ],
    customerNote: "Leave at the gate, call on arrival.",
    pickupInStore: false,
    ...over,
  };
}

describe("renderPackingSlipHtml (Story 29.3 — AC2)", () => {
  it("renders a self-contained HTML document", () => {
    const html = renderPackingSlipHtml(slip());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("shows the Woo order number (AC2)", () => {
    expect(renderPackingSlipHtml(slip())).toContain("1001");
  });

  it("shows the customer name + phone (AC2)", () => {
    const html = renderPackingSlipHtml(slip());
    expect(html).toContain("Asha Otieno");
    expect(html).toContain("+254712345678");
  });

  it("shows every shipping address line (AC2)", () => {
    const html = renderPackingSlipHtml(slip());
    expect(html).toContain("12 Riverside Drive");
    expect(html).toContain("Apt 4B");
    expect(html).toContain("Nairobi, Nairobi 00100");
  });

  it("shows the delivery method (AC2)", () => {
    expect(renderPackingSlipHtml(slip())).toContain("Boda delivery");
  });

  it("lists each line item with its mandatory quantity (AC2)", () => {
    const html = renderPackingSlipHtml(slip());
    expect(html).toContain("Baby carrier");
    expect(html).toContain("Muslin wrap");
    // Quantities are present for each line.
    expect(html).toMatch(/2/);
    expect(html).toMatch(/3/);
  });

  it("shows the customer note / special instructions (AC2)", () => {
    expect(renderPackingSlipHtml(slip())).toContain("Leave at the gate, call on arrival.");
  });

  it("carries NO price totals (AC: qty mandatory, no totals)", () => {
    const html = renderPackingSlipHtml(slip());
    expect(html).not.toContain("KES");
    expect(html).not.toMatch(/total/i);
    expect(html).not.toMatch(/\bprice\b/i);
  });

  it("renders the Pickup-in-store fallback when there is no shipping address (test hint)", () => {
    const html = renderPackingSlipHtml(
      slip({ shippingAddress: [], pickupInStore: true, deliveryMethod: "Pickup in store" }),
    );
    expect(html).toMatch(/pickup in store/i);
  });

  it("HTML-escapes untrusted text (a malicious customer note cannot inject markup)", () => {
    const html = renderPackingSlipHtml(slip({ customerNote: "<script>alert(1)</script>" }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("omits the customer-note block entirely when there is no note", () => {
    const html = renderPackingSlipHtml(slip({ customerNote: null }));
    expect(html).not.toMatch(/special instructions/i);
  });
});

describe("packingSlipContentType", () => {
  it("is printable HTML", () => {
    expect(packingSlipContentType()).toBe("text/html; charset=utf-8");
  });
});
