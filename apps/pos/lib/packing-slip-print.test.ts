import { describe, expect, it, vi } from "vitest";
import type { PackingSlip } from "@bm/contracts";
import { printPackingSlip } from "./packing-slip-print";

/**
 * Story 29.3 (P4-E04-S03) — the POS packing-slip print path (AC3). Decision 13:
 * printing is the browser's default print dialog, not a native print server. The
 * slip render is pushed into a fresh print window and `print()` is triggered, so
 * it reaches the SYSTEM DEFAULT PRINTER. The slip is rendered from the card the
 * client already holds (built from the mirror) — `printPackingSlip` takes a
 * `PackingSlip` and never reaches for a Woo client (AC4). Tested against a mocked
 * window so no real print dialog opens.
 */
function slip(over: Partial<PackingSlip> = {}): PackingSlip {
  return {
    orderNumber: "1001",
    customerName: "Asha Otieno",
    customerPhone: "+254712345678",
    shippingAddress: ["12 Riverside Drive", "Nairobi"],
    deliveryMethod: "Boda delivery",
    items: [{ name: "Baby carrier", quantity: 2 }],
    customerNote: null,
    pickupInStore: false,
    ...over,
  };
}

function mockWindow() {
  const doc = {
    open: vi.fn(),
    write: vi.fn(),
    close: vi.fn(),
  };
  const printWindow = {
    document: doc,
    focus: vi.fn(),
    print: vi.fn(),
    close: vi.fn(),
  };
  const win = {
    open: vi.fn(() => printWindow),
  } as unknown as Window;
  return { win, printWindow, doc };
}

describe("printPackingSlip (Story 29.3 — AC3, AC4)", () => {
  it("opens a print window and triggers print() (system default printer — AC3)", () => {
    const { win, printWindow, doc } = mockWindow();
    printPackingSlip(slip(), win);
    expect(win.open).toHaveBeenCalled();
    expect(doc.write).toHaveBeenCalledTimes(1);
    expect(printWindow.print).toHaveBeenCalledTimes(1);
  });

  it("writes the rendered packing-slip HTML into the print window (AC2)", () => {
    const { win, doc } = mockWindow();
    printPackingSlip(slip(), win);
    const written = doc.write.mock.calls[0]![0] as string;
    expect(written).toContain("<!DOCTYPE html>");
    expect(written).toContain("1001");
    expect(written).toContain("Baby carrier");
  });

  it("renders the Pickup-in-store fallback through the print path", () => {
    const { win, doc } = mockWindow();
    printPackingSlip(slip({ shippingAddress: [], pickupInStore: true, deliveryMethod: "Pickup in store" }), win);
    const written = doc.write.mock.calls[0]![0] as string;
    expect(written).toMatch(/pickup in store/i);
  });

  it("returns false (no-op) when no window is available (SSR-safe)", () => {
    expect(printPackingSlip(slip(), undefined)).toBe(false);
  });

  it("returns false when the print window is blocked by a popup blocker", () => {
    const win = { open: vi.fn(() => null) } as unknown as Window;
    expect(printPackingSlip(slip(), win)).toBe(false);
  });

  it("returns true on a successful print dispatch", () => {
    const { win } = mockWindow();
    expect(printPackingSlip(slip(), win)).toBe(true);
  });
});
