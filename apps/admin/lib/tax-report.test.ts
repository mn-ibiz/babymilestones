import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTaxReport,
  taxCsvHref,
  taxPdfHref,
  defaultTaxRange,
  type TaxReport,
} from "./tax-report";

/**
 * P6-E07-S06 (Story 35.6) — admin tax-ready export client logic. Framework-free so
 * it unit-tests without React: the read seam over the admin-gated
 * `/admin/tax-report` API (fromDate + toDate), and the CSV ("Excel") + printable
 * HTML ("PDF") export links (AC2).
 */

function report(over: Partial<TaxReport> = {}): TaxReport {
  return {
    fromDate: "2026-04-01",
    toDate: "2026-05-31",
    taxableSuppliesCents: 150_00,
    vatChargedCents: 24_00,
    exemptSuppliesCents: 50_00,
    totalSuppliesCents: 200_00,
    byMonth: [
      { month: "2026-04", taxableSuppliesCents: 100_00, vatChargedCents: 16_00, exemptSuppliesCents: 20_00, totalSuppliesCents: 120_00 },
      { month: "2026-05", taxableSuppliesCents: 50_00, vatChargedCents: 8_00, exemptSuppliesCents: 30_00, totalSuppliesCents: 80_00 },
    ],
    ...over,
  };
}

describe("fetchTaxReport (Story 35.6)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the report from the admin endpoint with the date range (credentialed)", async () => {
    const dto = report();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(dto), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchTaxReport({ fromDate: "2026-04-01", toDate: "2026-05-31" });
    expect(out).toEqual(dto);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/tax-report?");
    expect(String(url)).toContain("fromDate=2026-04-01");
    expect(String(url)).toContain("toDate=2026-05-31");
    expect(init?.credentials).toBe("include");
  });

  it("surfaces a 403 (forbidden) as the server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ error: "Forbidden: missing permission" }), { status: 403, headers: { "content-type": "application/json" } })),
    );
    await expect(fetchTaxReport({ fromDate: "2026-04-01", toDate: "2026-05-31" })).rejects.toThrow(/forbidden/i);
  });
});

describe("export links (AC2)", () => {
  it("builds CSV ('Excel') + PDF links carrying the same date range", () => {
    const csv = taxCsvHref({ fromDate: "2026-04-01", toDate: "2026-05-31" });
    expect(csv).toContain("/admin/tax-report/export.csv");
    expect(csv).toContain("fromDate=2026-04-01");
    expect(csv).toContain("toDate=2026-05-31");

    const pdf = taxPdfHref({ fromDate: "2026-04-01", toDate: "2026-05-31" });
    expect(pdf).toContain("/admin/tax-report/export.pdf");
    expect(pdf).toContain("toDate=2026-05-31");
  });
});

describe("default range", () => {
  it("defaults to the current calendar month", () => {
    const range = defaultTaxRange(new Date("2026-05-17T12:00:00Z"));
    expect(range.fromDate).toBe("2026-05-01");
    expect(range.toDate).toBe("2026-05-17");
  });
});
