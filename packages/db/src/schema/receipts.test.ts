import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../testing.js";
import { services } from "./services.js";
import { receipts, receiptLines } from "./receipts.js";

describe("receipts schema (P1-E08-S01)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedService(): Promise<string> {
    const [s] = await dbh.db
      .insert(services)
      .values({ name: "Play session", unit: "play", taxTreatment: "vat_inclusive" })
      .returning();
    return s!.id;
  }

  async function insertReceipt(overrides: Partial<typeof receipts.$inferInsert> = {}) {
    const [r] = await dbh.db
      .insert(receipts)
      .values({
        series: "BM-2026",
        sequenceNumber: 1,
        total: 150_000,
        taxTotal: 20_690,
        paymentMethod: "wallet",
        postedBy: "reception",
        ...overrides,
      })
      .returning();
    return r!;
  }

  it("inserts a receipt with KRA fields left null (AC1)", async () => {
    const r = await insertReceipt();
    expect(r.total).toBe(150_000);
    expect(r.taxTotal).toBe(20_690);
    expect(r.paymentMethod).toBe("wallet");
    expect(r.postedBy).toBe("reception");
    expect(r.parentId).toBeNull();
    // All KRA / eTIMS fields are nullable now (filled when eTIMS goes live in P5).
    expect(r.pin).toBeNull();
    expect(r.controlUnitNumber).toBeNull();
    expect(r.cuInvoiceNumber).toBeNull();
    expect(r.qrData).toBeNull();
    expect(r.etimsStatus).toBeNull();
    expect(r.createdAt).toBeInstanceOf(Date);
  });

  it("accepts populated KRA fields with a valid etims_status (AC1)", async () => {
    const r = await insertReceipt({
      sequenceNumber: 2,
      pin: "P051234567X",
      controlUnitNumber: "CU0100000001",
      cuInvoiceNumber: "INV-0001",
      qrData: "https://etims.kra.go.ke/verify?x=abc",
      etimsStatus: "accepted",
    });
    expect(r.pin).toBe("P051234567X");
    expect(r.etimsStatus).toBe("accepted");
  });

  it("rejects an unknown etims_status (CHECK constraint) (AC1)", async () => {
    await expect(
      insertReceipt({ sequenceNumber: 3, etimsStatus: "exploded" as never }),
    ).rejects.toThrow();
  });

  it("stores money columns as bigint, never float (AC1)", async () => {
    const res = await dbh.pg.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'receipts' AND column_name IN ('total', 'tax_total')`,
    );
    for (const row of res.rows) {
      expect(row.data_type).toBe("bigint");
    }
  });

  it("enforces per-series sequence uniqueness (AC3)", async () => {
    await insertReceipt({ series: "BM-2026", sequenceNumber: 100 });
    // Same series + same sequence -> rejected.
    await expect(
      insertReceipt({ series: "BM-2026", sequenceNumber: 100 }),
    ).rejects.toThrow();
    // Same sequence in a DIFFERENT series -> allowed.
    const other = await insertReceipt({ series: "BM-2027", sequenceNumber: 100 });
    expect(other.series).toBe("BM-2027");
  });

  it("inserts a receipt_line for a service with line tax (AC2)", async () => {
    const r = await insertReceipt({ sequenceNumber: 10 });
    const serviceId = await seedService();
    const [line] = await dbh.db
      .insert(receiptLines)
      .values({
        receiptId: r.id,
        serviceId,
        quantity: 2,
        unitPrice: 75_000,
        lineTax: 20_690,
        lineTotal: 150_000,
      })
      .returning();
    expect(line!.serviceId).toBe(serviceId);
    expect(line!.productId).toBeNull();
    expect(line!.quantity).toBe(2);
    expect(line!.lineTax).toBe(20_690);
    expect(line!.lineTotal).toBe(150_000);
  });

  it("inserts a receipt_line for a product (AC2)", async () => {
    const r = await insertReceipt({ sequenceNumber: 11 });
    const [line] = await dbh.db
      .insert(receiptLines)
      .values({
        receiptId: r.id,
        productId: "00000000-0000-0000-0000-0000000000aa",
        quantity: 1,
        unitPrice: 50_000,
        lineTax: 0,
        lineTotal: 50_000,
      })
      .returning();
    expect(line!.productId).toBe("00000000-0000-0000-0000-0000000000aa");
    expect(line!.serviceId).toBeNull();
  });

  it("rejects a line with both service_id and product_id (one-of CHECK) (AC2)", async () => {
    const r = await insertReceipt({ sequenceNumber: 12 });
    const serviceId = await seedService();
    await expect(
      dbh.db.insert(receiptLines).values({
        receiptId: r.id,
        serviceId,
        productId: "00000000-0000-0000-0000-0000000000bb",
        quantity: 1,
        unitPrice: 1,
        lineTax: 0,
        lineTotal: 1,
      }),
    ).rejects.toThrow();
  });

  it("rejects a line with neither service_id nor product_id (one-of CHECK) (AC2)", async () => {
    const r = await insertReceipt({ sequenceNumber: 13 });
    await expect(
      dbh.db.insert(receiptLines).values({
        receiptId: r.id,
        quantity: 1,
        unitPrice: 1,
        lineTax: 0,
        lineTotal: 1,
      }),
    ).rejects.toThrow();
  });

  it("rejects a line for a non-existent receipt (FK)", async () => {
    const serviceId = await seedService();
    await expect(
      dbh.db.insert(receiptLines).values({
        receiptId: "00000000-0000-0000-0000-000000000000",
        serviceId,
        quantity: 1,
        unitPrice: 1,
        lineTax: 0,
        lineTotal: 1,
      }),
    ).rejects.toThrow();
  });
});
