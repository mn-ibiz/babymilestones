import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { receiptLines, receipts, services } from "@bm/db";
import { loadTaxReport } from "./tax-report-db.js";

/**
 * P6-E07-S06 (Story 35.6) — DB read behind the tax-ready export. DB-backed via the
 * PGlite harness. Verifies the assembler loads SETTLED, NON-VOIDED receipt lines in
 * the half-open `[from, to)` window keyed on the receipt's `created_at`, derives the
 * VATable/exempt split + VAT (AC1), excludes voided receipts (the void row AND its
 * original), respects the period filter, and zero-fills empty months.
 */
describe("loadTaxReport (Story 35.6)", () => {
  let dbh: TestDb;
  let seq = 0;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  /** Seed a service with a tax treatment; returns its id. */
  async function seedService(taxTreatment: string): Promise<string> {
    const [s] = await dbh.db
      .insert(services)
      .values({ name: `svc-${seq}`, unit: "play", taxTreatment: taxTreatment as never })
      .returning();
    return s!.id;
  }

  /**
   * Seed a receipt header + lines. `lines` give gross line totals + line tax; the
   * net (taxable / exempt value) is `lineTotal - lineTax`.
   */
  async function seedReceipt(opts: {
    createdAt: Date;
    kind?: "normal" | "void";
    reversesReceiptId?: string;
    lines: { serviceId?: string | null; productId?: string | null; lineTax: number; lineTotal: number }[];
  }): Promise<string> {
    seq += 1;
    const total = opts.lines.reduce((s, l) => s + l.lineTotal, 0);
    const taxTotal = opts.lines.reduce((s, l) => s + l.lineTax, 0);
    const [r] = await dbh.db
      .insert(receipts)
      .values({
        series: "BM-2026",
        sequenceNumber: seq,
        kind: opts.kind ?? "normal",
        reversesReceiptId: opts.reversesReceiptId ?? null,
        total,
        taxTotal,
        paymentMethod: "cash",
        postedBy: "reception",
        createdAt: opts.createdAt,
      })
      .returning();
    for (const l of opts.lines) {
      await dbh.db.insert(receiptLines).values({
        receiptId: r!.id,
        serviceId: l.serviceId ?? null,
        productId: l.serviceId ? null : (l.productId ?? "00000000-0000-0000-0000-0000000000aa"),
        quantity: 1,
        unitPrice: l.lineTotal,
        lineTax: l.lineTax,
        lineTotal: l.lineTotal,
      });
    }
    return r!.id;
  }

  it("splits taxable vs exempt supplies + sums VAT for a mixed period (AC1)", async () => {
    const vatable = await seedService("vat_inclusive");
    const exempt = await seedService("vat_exempt");

    // VATable line: gross 116.00, VAT 16.00 → net taxable 100.00
    await seedReceipt({
      createdAt: new Date("2026-05-10T10:00:00Z"),
      lines: [{ serviceId: vatable, lineTax: 16_00, lineTotal: 116_00 }],
    });
    // Exempt line: gross 30.00, no VAT → net exempt 30.00
    await seedReceipt({
      createdAt: new Date("2026-05-12T10:00:00Z"),
      lines: [{ serviceId: exempt, lineTax: 0, lineTotal: 30_00 }],
    });

    const out = await loadTaxReport(dbh.db, { fromDate: "2026-05-01", toDate: "2026-05-31" });
    expect(out.taxableSuppliesCents).toBe(100_00);
    expect(out.vatChargedCents).toBe(16_00);
    expect(out.exemptSuppliesCents).toBe(30_00);
    expect(out.totalSuppliesCents).toBe(130_00);
  });

  it("excludes voided receipts — both the void row AND its original (AC1)", async () => {
    const vatable = await seedService("vat_exclusive");

    // A receipt that is later voided: gross 58.00, VAT 8.00.
    const original = await seedReceipt({
      createdAt: new Date("2026-05-05T09:00:00Z"),
      lines: [{ serviceId: vatable, lineTax: 8_00, lineTotal: 58_00 }],
    });
    // Its void reversing row (negated money, kind=void, reverses the original).
    await seedReceipt({
      createdAt: new Date("2026-05-06T09:00:00Z"),
      kind: "void",
      reversesReceiptId: original,
      lines: [{ serviceId: vatable, lineTax: -8_00, lineTotal: -58_00 }],
    });
    // A surviving (non-voided) receipt: gross 23.20, VAT 3.20 → net 20.00.
    await seedReceipt({
      createdAt: new Date("2026-05-07T09:00:00Z"),
      lines: [{ serviceId: vatable, lineTax: 3_20, lineTotal: 23_20 }],
    });

    const out = await loadTaxReport(dbh.db, { fromDate: "2026-05-01", toDate: "2026-05-31" });
    // Only the surviving receipt counts — the voided pair nets out AND is excluded.
    expect(out.taxableSuppliesCents).toBe(20_00);
    expect(out.vatChargedCents).toBe(3_20);
    expect(out.exemptSuppliesCents).toBe(0);
  });

  it("respects the period filter (lines outside [from, to] are excluded)", async () => {
    const vatable = await seedService("vat_inclusive");
    // April — before the window.
    await seedReceipt({ createdAt: new Date("2026-04-30T23:00:00Z"), lines: [{ serviceId: vatable, lineTax: 16_00, lineTotal: 116_00 }] });
    // June — after the window.
    await seedReceipt({ createdAt: new Date("2026-06-01T00:30:00Z"), lines: [{ serviceId: vatable, lineTax: 16_00, lineTotal: 116_00 }] });
    // May — inside the window.
    await seedReceipt({ createdAt: new Date("2026-05-15T12:00:00Z"), lines: [{ serviceId: vatable, lineTax: 32_00, lineTotal: 232_00 }] });

    const out = await loadTaxReport(dbh.db, { fromDate: "2026-05-01", toDate: "2026-05-31" });
    expect(out.taxableSuppliesCents).toBe(200_00);
    expect(out.vatChargedCents).toBe(32_00);
  });

  it("zero data → all zeros, both periods present", async () => {
    const out = await loadTaxReport(dbh.db, { fromDate: "2026-05-01", toDate: "2026-05-31" });
    expect(out.taxableSuppliesCents).toBe(0);
    expect(out.vatChargedCents).toBe(0);
    expect(out.exemptSuppliesCents).toBe(0);
    expect(out.totalSuppliesCents).toBe(0);
  });

  it("produces a zero-filled per-month breakdown across the range (AC1)", async () => {
    const vatable = await seedService("vat_inclusive");
    const exempt = await seedService("vat_exempt");
    // April: VATable net 100.00 + VAT 16.00.
    await seedReceipt({ createdAt: new Date("2026-04-10T10:00:00Z"), lines: [{ serviceId: vatable, lineTax: 16_00, lineTotal: 116_00 }] });
    // June: exempt net 50.00. (May intentionally empty.)
    await seedReceipt({ createdAt: new Date("2026-06-10T10:00:00Z"), lines: [{ serviceId: exempt, lineTax: 0, lineTotal: 50_00 }] });

    const out = await loadTaxReport(dbh.db, { fromDate: "2026-04-01", toDate: "2026-06-30" });
    expect(out.byMonth!.map((m) => m.month)).toEqual(["2026-04", "2026-05", "2026-06"]);

    const apr = out.byMonth!.find((m) => m.month === "2026-04")!;
    expect(apr.taxableSuppliesCents).toBe(100_00);
    expect(apr.vatChargedCents).toBe(16_00);

    const may = out.byMonth!.find((m) => m.month === "2026-05")!;
    expect(may.taxableSuppliesCents).toBe(0);
    expect(may.exemptSuppliesCents).toBe(0);

    const jun = out.byMonth!.find((m) => m.month === "2026-06")!;
    expect(jun.exemptSuppliesCents).toBe(50_00);

    // Whole-period totals reconcile.
    expect(out.taxableSuppliesCents).toBe(100_00);
    expect(out.exemptSuppliesCents).toBe(50_00);
    expect(out.vatChargedCents).toBe(16_00);
  });

  it("treats zero-rated lines as exempt-of-VAT supplies (no VAT)", async () => {
    const zeroRated = await seedService("zero_rated");
    await seedReceipt({ createdAt: new Date("2026-05-10T10:00:00Z"), lines: [{ serviceId: zeroRated, lineTax: 0, lineTotal: 40_00 }] });
    const out = await loadTaxReport(dbh.db, { fromDate: "2026-05-01", toDate: "2026-05-31" });
    expect(out.taxableSuppliesCents).toBe(0);
    expect(out.exemptSuppliesCents).toBe(40_00);
    expect(out.vatChargedCents).toBe(0);
  });
});
