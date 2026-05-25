import { describe, expect, it, vi } from "vitest";
import type { ReceiptResponse, ReceiptPayload, ReceiptSmsResponse } from "@bm/contracts";
import {
  RECEIPT_ACTIONS,
  receiptUrl,
  receiptSmsUrl,
  printReceipt,
  smsResultLabel,
  type PrintPort,
} from "./receipt";

/**
 * P1-E05-S06 — Reception receipt client logic. Pure + dependency-free; the
 * print port is injected so no real window/DOM is needed. Covers: the
 * Print+SMS action pair (AC1), the API URL builders, browser-print rendering of
 * the payload via the port (AC2), reprint reuse (AC4 — same path, any time), and
 * the SMS result labels (AC3).
 */
function payload(over: Partial<ReceiptPayload> = {}): ReceiptPayload {
  return {
    transactionId: "tx-1",
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

describe("receipt actions + URLs (P1-E05-S06 AC1/AC3/AC4)", () => {
  it("exposes the Print + SMS action pair (AC1)", () => {
    expect(RECEIPT_ACTIONS).toEqual(["print", "sms"]);
  });
  it("builds the receipt + SMS endpoints for a transaction", () => {
    expect(receiptUrl("tx-9")).toBe("/reception/receipt/tx-9");
    expect(receiptSmsUrl("tx-9")).toBe("/reception/receipt/tx-9/sms");
  });
});

describe("printReceipt (P1-E05-S06 AC2/AC4 — browser print via the port)", () => {
  it("fetches the payload, renders ReceiptPreview HTML, and prints it", async () => {
    const body: ReceiptResponse = { receipt: payload() };
    const fetchJson = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    }) as unknown as typeof fetch;
    const printed: string[] = [];
    const port: PrintPort = { print: (html) => printed.push(html) };

    const html = await printReceipt("tx-1", { fetchJson, port });
    expect((fetchJson as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "/reception/receipt/tx-1",
    );
    expect(printed).toHaveLength(1);
    expect(html).toContain("Asha Mwangi");
    expect(html).toContain("KES 500.00");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("reprints from history via the same path, any time (AC4)", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ receipt: payload({ transactionId: "old-tx" }) }) as ReceiptResponse,
    }) as unknown as typeof fetch;
    const port: PrintPort = { print: vi.fn() };
    await printReceipt("old-tx", { fetchJson, port });
    expect((fetchJson as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "/reception/receipt/old-tx",
    );
    expect(port.print).toHaveBeenCalledOnce();
  });

  it("throws (does not print) when the receipt cannot be loaded", async () => {
    const fetchJson = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    const port: PrintPort = { print: vi.fn() };
    await expect(printReceipt("missing", { fetchJson, port })).rejects.toThrow(/404/u);
    expect(port.print).not.toHaveBeenCalled();
  });
});

describe("smsResultLabel (P1-E05-S06 AC3)", () => {
  it("confirms a sent copy", () => {
    expect(smsResultLabel({ transactionId: "t", sent: true, reason: null } as ReceiptSmsResponse)).toBe(
      "Receipt sent by SMS",
    );
  });
  it("explains a consent-gated drop", () => {
    expect(
      smsResultLabel({ transactionId: "t", sent: false, reason: "no_consent" } as ReceiptSmsResponse),
    ).toBe("Parent has not opted in to SMS");
  });
});
