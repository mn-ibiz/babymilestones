import { describe, expect, it } from "vitest";
import {
  renderReceiptA4,
  renderReceiptThermal,
  toReceiptDocument,
  type ReceiptBusinessDetails,
} from "./receipt-document.js";

/**
 * P5-E02-S04 — VAT registration metadata in the receipt footer. The PIN, VAT
 * registration number and registered address an admin records once must appear
 * in the footer block of BOTH the A4 and the thermal render (AC2).
 */
describe("receipt VAT/registration footer (P5-E02-S04)", () => {
  const business: ReceiptBusinessDetails = {
    name: "Baby Milestones Ltd",
    addressLines: ["Westlands"],
    phone: "+254700000000",
    kraPin: "P051234567A",
    vatRegistrationNumber: "VAT-998877",
    registeredAddress: "P.O. Box 123, Nairobi, Kenya",
  };

  function doc() {
    return toReceiptDocument(
      {
        displayNumber: "BM-2026-000001",
        paymentMethod: "cash",
        total: 11600,
        taxTotal: 1600,
        createdAt: "2026-05-30T10:00:00.000Z",
        lines: [{ description: "Item", quantity: 1, unitPrice: 10000, lineTax: 1600, lineTotal: 11600 }],
      },
      { business },
    );
  }

  it("A4 footer shows PIN, VAT registration number and registered address (AC2)", () => {
    const html = renderReceiptA4(doc());
    expect(html).toContain("P051234567A");
    expect(html).toContain("VAT-998877");
    expect(html).toContain("P.O. Box 123, Nairobi, Kenya");
  });

  it("thermal footer shows PIN, VAT registration number and registered address (AC2)", () => {
    const text = renderReceiptThermal(doc());
    expect(text).toContain("P051234567A");
    expect(text).toContain("VAT-998877");
    expect(text).toContain("P.O. Box 123, Nairobi, Kenya");
  });

  it("omits VAT lines cleanly when the metadata is absent (no empty labels)", () => {
    const bare = toReceiptDocument(
      {
        displayNumber: "BM-2026-000002",
        paymentMethod: "cash",
        total: 100,
        taxTotal: 0,
        createdAt: "2026-05-30T10:00:00.000Z",
        lines: [{ description: "Item", quantity: 1, unitPrice: 100, lineTax: 0, lineTotal: 100 }],
      },
      { business: { name: "BM", addressLines: ["NBO"], phone: "+254700000000" } },
    );
    const html = renderReceiptA4(bare);
    const text = renderReceiptThermal(bare);
    expect(html).not.toContain("VAT Reg");
    expect(text).not.toContain("VAT Reg");
  });

  it("HTML-escapes the VAT metadata in the A4 footer", () => {
    const d = toReceiptDocument(
      {
        displayNumber: "BM-2026-000003",
        paymentMethod: "cash",
        total: 100,
        taxTotal: 0,
        createdAt: "2026-05-30T10:00:00.000Z",
        lines: [{ description: "Item", quantity: 1, unitPrice: 100, lineTax: 0, lineTotal: 100 }],
      },
      {
        business: {
          name: "BM",
          addressLines: ["NBO"],
          phone: "+254700000000",
          registeredAddress: "A & B <Ltd>",
        },
      },
    );
    const html = renderReceiptA4(d);
    expect(html).toContain("A &amp; B &lt;Ltd&gt;");
    expect(html).not.toContain("A & B <Ltd>");
  });
});
