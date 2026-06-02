import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, receiptLines, receipts, services, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P6-E07-S06 (Story 35.6) — tax-ready export admin API. Integration via app.inject
 * with real staff sessions (+ CSRF). The read endpoint returns the per-period
 * taxable supplies / VAT charged / exempt supplies (AC1); the export endpoints
 * return CSV ("Excel") and printable HTML ("PDF") under the same filter (AC2) and
 * emit `report.tax.export`. Tax data is finance-sensitive — gated to the
 * finance/report roles (accountant / admin / super_admin / treasury); reception
 * 403, unauth 401.
 *
 *   GET /admin/tax-report?fromDate&toDate            — JSON report (AC1).
 *   GET /admin/tax-report/export.csv?fromDate&toDate — CSV ("Excel") (AC2).
 *   GET /admin/tax-report/export.pdf?fromDate&toDate — printable HTML (AC2).
 */
describe("Admin tax-ready export API (P6-E07-S06)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let seq = 0;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const get = (url: string, creds: Creds) =>
    app.inject({
      method: "GET",
      url,
      headers: { cookie: [creds.session, creds.csrfCookie].join("; "), "x-csrf-token": creds.csrfToken },
    });

  async function seedService(taxTreatment: string): Promise<string> {
    seq += 1;
    const [s] = await dbh.db
      .insert(services)
      .values({ name: `svc-${seq}`, unit: "play", taxTreatment: taxTreatment as never })
      .returning();
    return s!.id;
  }

  async function seedReceipt(opts: {
    createdAt: Date;
    kind?: "normal" | "void";
    reversesReceiptId?: string;
    lines: { serviceId: string; lineTax: number; lineTotal: number }[];
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
        serviceId: l.serviceId,
        quantity: 1,
        unitPrice: l.lineTotal,
        lineTax: l.lineTax,
        lineTotal: l.lineTotal,
      });
    }
    return r!.id;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254715000001", "8421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254715000002", "8422", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254715000004", "8424", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254715000005", "8425", "accountant"));
    await dbh.db.insert(users).values(await staffUserSeed("+254715000003", "8423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("returns the taxable / VAT / exempt figures for a period (AC1)", async () => {
    const creds = await loginStaff("+254715000001", "8421");
    const vatable = await seedService("vat_inclusive");
    const exempt = await seedService("vat_exempt");
    // VATable: gross 116.00, VAT 16.00 → net taxable 100.00.
    await seedReceipt({ createdAt: new Date("2026-05-10T10:00:00Z"), lines: [{ serviceId: vatable, lineTax: 16_00, lineTotal: 116_00 }] });
    // Exempt: gross 30.00, no VAT.
    await seedReceipt({ createdAt: new Date("2026-05-12T10:00:00Z"), lines: [{ serviceId: exempt, lineTax: 0, lineTotal: 30_00 }] });

    const res = await get("/admin/tax-report?fromDate=2026-05-01&toDate=2026-05-31", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.fromDate).toBe("2026-05-01");
    expect(body.toDate).toBe("2026-05-31");
    expect(body.taxableSuppliesCents).toBe(100_00);
    expect(body.vatChargedCents).toBe(16_00);
    expect(body.exemptSuppliesCents).toBe(30_00);
    expect(body.totalSuppliesCents).toBe(130_00);
    expect(Array.isArray(body.byMonth)).toBe(true);
  });

  it("excludes voided receipts (AC1)", async () => {
    const creds = await loginStaff("+254715000001", "8421");
    const vatable = await seedService("vat_exclusive");
    const original = await seedReceipt({ createdAt: new Date("2026-05-05T09:00:00Z"), lines: [{ serviceId: vatable, lineTax: 8_00, lineTotal: 58_00 }] });
    await seedReceipt({ createdAt: new Date("2026-05-06T09:00:00Z"), kind: "void", reversesReceiptId: original, lines: [{ serviceId: vatable, lineTax: -8_00, lineTotal: -58_00 }] });
    await seedReceipt({ createdAt: new Date("2026-05-07T09:00:00Z"), lines: [{ serviceId: vatable, lineTax: 3_20, lineTotal: 23_20 }] });

    const res = await get("/admin/tax-report?fromDate=2026-05-01&toDate=2026-05-31", creds);
    const body = res.json();
    expect(body.taxableSuppliesCents).toBe(20_00);
    expect(body.vatChargedCents).toBe(3_20);
  });

  it("400s an inverted date range", async () => {
    const creds = await loginStaff("+254715000001", "8421");
    const res = await get("/admin/tax-report?fromDate=2026-05-31&toDate=2026-05-01", creds);
    expect(res.statusCode).toBe(400);
  });

  it("exports CSV ('Excel') with a Content-Disposition + emits report.tax.export (AC2)", async () => {
    const creds = await loginStaff("+254715000001", "8421");
    const vatable = await seedService("vat_inclusive");
    await seedReceipt({ createdAt: new Date("2026-05-10T10:00:00Z"), lines: [{ serviceId: vatable, lineTax: 16_00, lineTotal: 116_00 }] });

    const res = await get("/admin/tax-report/export.csv?fromDate=2026-05-01&toDate=2026-05-31", creds);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("tax_2026-05-01_2026-05-31.csv");
    expect(res.body.split("\r\n")[0]).toBe("period,taxable_supplies_kes,vat_charged_kes,exempt_supplies_kes,total_supplies_kes");
    expect(res.body).toContain("Total,100.00,16.00,0.00,100.00");

    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "report.tax.export"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({ fromDate: "2026-05-01", toDate: "2026-05-31", format: "csv" });
  });

  it("exports printable HTML ('PDF') with a Content-Disposition + emits report.tax.export (AC2)", async () => {
    const creds = await loginStaff("+254715000001", "8421");
    const res = await get("/admin/tax-report/export.pdf?fromDate=2026-05-01&toDate=2026-05-31", creds);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["content-disposition"]).toContain("tax_2026-05-01_2026-05-31.html");
    expect(res.body).toContain("<!DOCTYPE html>");
    expect(res.body).toContain("Tax-ready summary");

    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "report.tax.export"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({ format: "pdf" });
  });

  it("allows the finance/report roles incl. accountant (RBAC)", async () => {
    const url = "/admin/tax-report?fromDate=2026-05-01&toDate=2026-05-31";
    expect((await get(url, await loginStaff("+254715000001", "8421"))).statusCode).toBe(200); // admin
    expect((await get(url, await loginStaff("+254715000002", "8422"))).statusCode).toBe(200); // super_admin
    expect((await get(url, await loginStaff("+254715000004", "8424"))).statusCode).toBe(200); // treasury
    expect((await get(url, await loginStaff("+254715000005", "8425"))).statusCode).toBe(200); // accountant
  });

  it("403s reception (not a finance role)", async () => {
    const res = await get("/admin/tax-report?fromDate=2026-05-01&toDate=2026-05-31", await loginStaff("+254715000003", "8423"));
    expect(res.statusCode).toBe(403);
  });

  it("403s the export for reception too", async () => {
    const res = await get("/admin/tax-report/export.csv?fromDate=2026-05-01&toDate=2026-05-31", await loginStaff("+254715000003", "8423"));
    expect(res.statusCode).toBe(403);
  });

  it("401s an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/tax-report?fromDate=2026-05-01&toDate=2026-05-31" });
    expect(res.statusCode).toBe(401);
  });
});
