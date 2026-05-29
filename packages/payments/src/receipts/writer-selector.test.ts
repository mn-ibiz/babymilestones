import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { settings } from "@bm/db";
import { isEtimsEnabled, resolveReceiptWriter } from "./writer-selector.js";
import { LocalReceiptWriter } from "./local-receipt-writer.js";
import type { EtimsConfig, EtimsTransport } from "./etims-receipt-writer.js";

/**
 * P5-E02-S03 — switch flag selects the writer at runtime. Off (default) →
 * LocalReceiptWriter; On → EtimsReceiptWriter. Clean rollback: flipping the flag
 * back picks the local writer again, with no data change.
 */
describe("receipt writer selector (P5-E02-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;

  const config: EtimsConfig = {
    baseUrl: "https://etims.example",
    pin: "P051234567A",
    branchId: "00",
    businessName: "BM",
    address: "Nairobi",
    apiKey: "k",
  };
  const transport: EtimsTransport = async () => ({
    status: 200,
    json: async () => ({ controlUnitNumber: "c", cuInvoiceNumber: "i", qrData: "q" }),
  });

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("defaults to OFF when the flag has never been set (AC2)", async () => {
    expect(await isEtimsEnabled(dbh.db)).toBe(false);
  });

  it("reads the persisted flag value", async () => {
    await dbh.db.insert(settings).values({ key: "etims", value: { enabled: true } });
    expect(await isEtimsEnabled(dbh.db)).toBe(true);
  });

  it("OFF → LocalReceiptWriter (AC2)", async () => {
    const writer = await resolveReceiptWriter(dbh.db, { etims: { config, transport } });
    expect(writer).toBeInstanceOf(LocalReceiptWriter);
  });

  it("ON → EtimsReceiptWriter when eTIMS is wired (AC2)", async () => {
    await dbh.db.insert(settings).values({ key: "etims", value: { enabled: true } });
    const writer = await resolveReceiptWriter(dbh.db, { etims: { config, transport } });
    // It is not the local writer; it satisfies the contract.
    expect(writer).not.toBeInstanceOf(LocalReceiptWriter);
    expect(typeof writer.writeReceipt).toBe("function");
  });

  it("ON but eTIMS NOT wired → falls back to LocalReceiptWriter (fail-safe)", async () => {
    await dbh.db.insert(settings).values({ key: "etims", value: { enabled: true } });
    const writer = await resolveReceiptWriter(dbh.db, {});
    expect(writer).toBeInstanceOf(LocalReceiptWriter);
  });

  it("flipping back to OFF is a clean rollback → LocalReceiptWriter again (AC4)", async () => {
    await dbh.db.insert(settings).values({ key: "etims", value: { enabled: true } });
    let writer = await resolveReceiptWriter(dbh.db, { etims: { config, transport } });
    expect(writer).not.toBeInstanceOf(LocalReceiptWriter);
    // Roll back.
    await dbh.db
      .insert(settings)
      .values({ key: "etims", value: { enabled: false } })
      .onConflictDoUpdate({ target: settings.key, set: { value: { enabled: false } } });
    writer = await resolveReceiptWriter(dbh.db, { etims: { config, transport } });
    expect(writer).toBeInstanceOf(LocalReceiptWriter);
  });
});
