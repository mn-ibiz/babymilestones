import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { receiptLines, receipts, services } from "@bm/db";
import {
  EtimsNotImplementedError,
  EtimsReceiptWriter,
  LocalReceiptWriter,
  formatReceiptNumber,
  writeReceipt,
  type ReceiptWriter,
  type WriteReceiptPayload,
} from "./index.js";

/**
 * P1-E08-S02 — receipt writer interface. Verifies the LocalReceiptWriter
 * persists a correct receipt + lines with null KRA fields, the per-series
 * sequence increments monotonically, and the EtimsReceiptWriter stub satisfies
 * the same contract while being a no-op.
 */
describe("receipt writer (P1-E08-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;

  async function seedService(): Promise<string> {
    const [s] = await dbh.db
      .insert(services)
      .values({ name: "Haircut", unit: "salon" })
      .returning();
    return s!.id;
  }

  function payload(over: Partial<WriteReceiptPayload> = {}): WriteReceiptPayload {
    return {
      series: "BM-2026",
      paymentMethod: "cash",
      postedBy: "staff-1",
      lines: [{ serviceId: undefined, quantity: 2, unitPrice: 25000, lineTax: 0, lineTotal: 50000 }],
      ...over,
    };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("formatReceiptNumber zero-pads the per-series sequence", () => {
    expect(formatReceiptNumber("BM-2026", 123)).toBe("BM-2026-000123");
  });

  it("LocalReceiptWriter persists a receipt + lines with null KRA fields (AC2)", async () => {
    const serviceId = await seedService();
    const writer = new LocalReceiptWriter();
    const receipt = await writer.writeReceipt(
      dbh.db,
      payload({ lines: [{ serviceId, quantity: 2, unitPrice: 25000, lineTax: 0, lineTotal: 50000 }] }),
    );

    expect(receipt.id).toBeTruthy();
    expect(receipt.sequenceNumber).toBe(1);
    expect(receipt.displayNumber).toBe("BM-2026-000001");
    expect(receipt.total).toBe(50000);
    expect(receipt.taxTotal).toBe(0);
    // KRA fields are null under the local writer.
    expect(receipt.pin).toBeNull();
    expect(receipt.controlUnitNumber).toBeNull();
    expect(receipt.cuInvoiceNumber).toBeNull();
    expect(receipt.qrData).toBeNull();
    expect(receipt.etimsStatus).toBeNull();
    expect(receipt.lines).toHaveLength(1);
    expect(receipt.lines[0]!.serviceId).toBe(serviceId);

    // Persisted to the DB.
    const [headerRow] = await dbh.db
      .select()
      .from(receipts)
      .where(eq(receipts.id, receipt.id));
    expect(headerRow!.pin).toBeNull();
    expect(headerRow!.etimsStatus).toBeNull();
    const lineRows = await dbh.db
      .select()
      .from(receiptLines)
      .where(eq(receiptLines.receiptId, receipt.id));
    expect(lineRows).toHaveLength(1);
    expect(lineRows[0]!.lineTotal).toBe(50000);
  });

  it("derives total and taxTotal from the lines", async () => {
    const serviceId = await seedService();
    const receipt = await new LocalReceiptWriter().writeReceipt(
      dbh.db,
      payload({
        lines: [
          { serviceId, quantity: 1, unitPrice: 10000, lineTax: 1600, lineTotal: 10000 },
          { productId: "00000000-0000-0000-0000-000000000001", quantity: 1, unitPrice: 5000, lineTax: 800, lineTotal: 5000 },
        ],
      }),
    );
    expect(receipt.total).toBe(15000);
    expect(receipt.taxTotal).toBe(2400);
    expect(receipt.lines).toHaveLength(2);
  });

  it("increments the per-series sequence monotonically", async () => {
    const serviceId = await seedService();
    const writer = new LocalReceiptWriter();
    const r1 = await writer.writeReceipt(dbh.db, payload({ lines: [{ serviceId, quantity: 1, unitPrice: 100, lineTax: 0, lineTotal: 100 }] }));
    const r2 = await writer.writeReceipt(dbh.db, payload({ lines: [{ serviceId, quantity: 1, unitPrice: 100, lineTax: 0, lineTotal: 100 }] }));
    const r3 = await writer.writeReceipt(dbh.db, payload({ lines: [{ serviceId, quantity: 1, unitPrice: 100, lineTax: 0, lineTotal: 100 }] }));
    expect([r1.sequenceNumber, r2.sequenceNumber, r3.sequenceNumber]).toEqual([1, 2, 3]);
  });

  it("keeps sequences independent across series", async () => {
    const serviceId = await seedService();
    const writer = new LocalReceiptWriter();
    const a = await writer.writeReceipt(dbh.db, payload({ series: "BM-2026", lines: [{ serviceId, quantity: 1, unitPrice: 1, lineTax: 0, lineTotal: 1 }] }));
    const b = await writer.writeReceipt(dbh.db, payload({ series: "BM-2027", lines: [{ serviceId, quantity: 1, unitPrice: 1, lineTax: 0, lineTotal: 1 }] }));
    expect(a.sequenceNumber).toBe(1);
    expect(b.sequenceNumber).toBe(1);
  });

  it("the writeReceipt default binding persists via the local writer", async () => {
    const serviceId = await seedService();
    const receipt = await writeReceipt(dbh.db, payload({ lines: [{ serviceId, quantity: 1, unitPrice: 1, lineTax: 0, lineTotal: 1 }] }));
    expect(receipt.sequenceNumber).toBe(1);
    expect(receipt.etimsStatus).toBeNull();
  });

  it("rejects a receipt with no lines", async () => {
    await expect(new LocalReceiptWriter().writeReceipt(dbh.db, payload({ lines: [] }))).rejects.toThrow();
  });

  it("rejects a line that sets neither or both of serviceId / productId", async () => {
    await expect(
      new LocalReceiptWriter().writeReceipt(dbh.db, payload({ lines: [{ quantity: 1, unitPrice: 1, lineTax: 0, lineTotal: 1 }] })),
    ).rejects.toThrow();
    await expect(
      new LocalReceiptWriter().writeReceipt(
        dbh.db,
        payload({ lines: [{ serviceId: "a", productId: "b", quantity: 1, unitPrice: 1, lineTax: 0, lineTotal: 1 }] }),
      ),
    ).rejects.toThrow();
  });

  it("EtimsReceiptWriter satisfies the ReceiptWriter contract and is a no-op stub (AC3)", async () => {
    // Type-level conformance: both writers are assignable to the same interface.
    const writers: ReceiptWriter[] = [new LocalReceiptWriter(), new EtimsReceiptWriter()];
    expect(writers).toHaveLength(2);
    await expect(
      new EtimsReceiptWriter().writeReceipt(dbh.db, payload()),
    ).rejects.toBeInstanceOf(EtimsNotImplementedError);
  });
});
