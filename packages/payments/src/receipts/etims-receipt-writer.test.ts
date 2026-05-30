import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { receiptLines, receipts, services } from "@bm/db";
import {
  EtimsConfigError,
  EtimsTransportError,
  createEtimsReceiptWriter,
  type EtimsConfig,
  type EtimsTransport,
} from "./etims-receipt-writer.js";
import type { WriteReceiptPayload } from "./index.js";

/**
 * P5-E02-S01 — live eTIMS receipt writer adapter. Real PGlite for persistence;
 * an INJECTED fake transport (never a real network). Covers config validation,
 * a successful KRA registration that fills the previously-nullable receipt
 * fields, the idempotency key sent to the transport, VAT-inclusive totals, and
 * the fail-safe "write no receipt on transport failure" guarantee.
 */
describe("eTIMS receipt writer adapter (P5-E02-S01)", () => {
  let dbh: TestDb;

  const CONFIG: EtimsConfig = {
    pin: "P051234567X",
    businessName: "Baby Milestones Ltd",
    apiKey: "secret-key",
    baseUrl: "https://etims.sandbox.kra.test",
    branchId: "00",
    address: "P.O. Box 1, Nairobi",
  };

  const accepted: EtimsTransport = async () => ({
    controlUnitNumber: "CU-0001",
    cuInvoiceNumber: "INV-0001",
    qrData: "https://etims.kra.test/qr/INV-0001",
  });

  async function seedService(): Promise<string> {
    const [s] = await dbh.db.insert(services).values({ name: "Daycare", unit: "daycare" }).returning();
    return s!.id;
  }

  function payload(over: Partial<WriteReceiptPayload> = {}): WriteReceiptPayload {
    return {
      series: "KRA-2026",
      paymentMethod: "cash",
      postedBy: "cashier-1",
      lines: [{ serviceId: undefined, quantity: 1, unitPrice: 11600, lineTax: 1600, lineTotal: 11600 }],
      ...over,
    };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("throws EtimsConfigError when a secret is missing (no real network from defaults)", () => {
    expect(() => createEtimsReceiptWriter({ ...CONFIG, apiKey: "" }, { transport: accepted })).toThrow(
      EtimsConfigError,
    );
  });

  it("registers the invoice with KRA and fills the previously-nullable fields (AC3)", async () => {
    const serviceId = await seedService();
    const writer = createEtimsReceiptWriter(CONFIG, { transport: accepted });
    const r = await writer.writeReceipt(
      dbh.db,
      payload({ lines: [{ serviceId, quantity: 1, unitPrice: 11600, lineTax: 1600, lineTotal: 11600 }] }),
    );

    expect(r.pin).toBe(CONFIG.pin);
    expect(r.controlUnitNumber).toBe("CU-0001");
    expect(r.cuInvoiceNumber).toBe("INV-0001");
    expect(r.qrData).toBe("https://etims.kra.test/qr/INV-0001");
    expect(r.etimsStatus).toBe("accepted");

    const [row] = await dbh.db.select().from(receipts).where(eq(receipts.id, r.id));
    expect(row!.controlUnitNumber).toBe("CU-0001");
    expect(row!.etimsStatus).toBe("accepted");
    const lineRows = await dbh.db.select().from(receiptLines).where(eq(receiptLines.receiptId, r.id));
    expect(lineRows).toHaveLength(1);
  });

  it("sends PIN, business name and the <series>-<seq> idempotency key to the transport (AC2)", async () => {
    const serviceId = await seedService();
    const transport = vi.fn(accepted);
    const writer = createEtimsReceiptWriter(CONFIG, { transport });
    const r = await writer.writeReceipt(
      dbh.db,
      payload({ lines: [{ serviceId, quantity: 1, unitPrice: 11600, lineTax: 1600, lineTotal: 11600 }] }),
    );

    expect(transport).toHaveBeenCalledTimes(1);
    const call = transport.mock.calls[0];
    expect(call).toBeDefined();
    const [invoice, opts] = call!;
    expect(invoice.sellerPin).toBe(CONFIG.pin);
    expect(invoice.businessName).toBe(CONFIG.businessName);
    expect(invoice.invoiceNumber).toBe(r.displayNumber);
    expect(opts.idempotencyKey).toBe(r.displayNumber);
  });

  it("derives total and taxTotal from the lines (VAT-inclusive)", async () => {
    const serviceId = await seedService();
    const writer = createEtimsReceiptWriter(CONFIG, { transport: accepted });
    const r = await writer.writeReceipt(
      dbh.db,
      payload({
        lines: [
          { serviceId, quantity: 2, unitPrice: 5800, lineTax: 1600, lineTotal: 11600 },
          { productId: "00000000-0000-0000-0000-000000000001", quantity: 1, unitPrice: 2320, lineTax: 320, lineTotal: 2320 },
        ],
      }),
    );
    expect(r.total).toBe(11600 + 2320);
    expect(r.taxTotal).toBe(1600 + 320);
  });

  it("increments the per-series sequence (idempotency key is unique per receipt)", async () => {
    const serviceId = await seedService();
    const writer = createEtimsReceiptWriter(CONFIG, { transport: accepted });
    const line = { serviceId, quantity: 1, unitPrice: 100, lineTax: 0, lineTotal: 100 };
    const r1 = await writer.writeReceipt(dbh.db, payload({ lines: [line] }));
    const r2 = await writer.writeReceipt(dbh.db, payload({ lines: [line] }));
    expect([r1.sequenceNumber, r2.sequenceNumber]).toEqual([1, 2]);
    expect(r1.displayNumber).not.toBe(r2.displayNumber);
  });

  it("writes NO receipt when the transport throws (clean slate for the retry queue)", async () => {
    const serviceId = await seedService();
    const failing: EtimsTransport = async () => {
      throw new Error("503 from KRA");
    };
    const writer = createEtimsReceiptWriter(CONFIG, { transport: failing });
    await expect(
      writer.writeReceipt(dbh.db, payload({ lines: [{ serviceId, quantity: 1, unitPrice: 100, lineTax: 0, lineTotal: 100 }] })),
    ).rejects.toBeInstanceOf(EtimsTransportError);

    const rows = await dbh.db.select().from(receipts);
    expect(rows).toHaveLength(0);
  });

  it("validates the payload (rejects an empty receipt) before contacting KRA", async () => {
    const transport = vi.fn(accepted);
    const writer = createEtimsReceiptWriter(CONFIG, { transport });
    await expect(writer.writeReceipt(dbh.db, payload({ lines: [] }))).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
