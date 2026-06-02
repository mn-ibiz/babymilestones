import { taxReportExportUrl, type TaxReportDto } from "@bm/contracts";

/**
 * Admin tax-ready export client logic (P6-E07-S06 / Story 35.6). The `/tax-report`
 * admin page reads the admin-gated `/admin/tax-report` API (credentialed — session
 * cookie + CSRF) for the picked date range and renders the per-period TAXABLE
 * SUPPLIES / VAT CHARGED / EXEMPT SUPPLIES (AC1) with CSV ("Excel") + printable-HTML
 * ("PDF") export links using the same filter (AC2). Framework-free so it unit-tests
 * without React; the export URLs are reused from `@bm/contracts`.
 *
 * Tax data is finance-sensitive: the API gates it to the finance/report roles
 * (accountant / admin / super_admin / treasury); this page reads it credentialed and
 * the server is the authority.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** The tax report DTO returned by the admin endpoint. */
export type TaxReport = TaxReportDto;

/** An inclusive `[fromDate, toDate]` range. */
export interface TaxRange {
  fromDate: string;
  toDate: string;
}

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Fetch the tax report for `range` from the admin-gated endpoint. Sends the session
 * cookie + CSRF token; throws the server error message on a non-2xx (e.g.
 * 400/401/403).
 */
export async function fetchTaxReport(range: TaxRange): Promise<TaxReport> {
  const params = new URLSearchParams({ fromDate: range.fromDate, toDate: range.toDate });
  const res = await fetch(`${API_BASE}/admin/tax-report?${params.toString()}`, {
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & TaxReport;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** The CSV ("Excel") export link for the picked range (AC2), against the API base. */
export function taxCsvHref(range: TaxRange): string {
  return `${API_BASE}${taxReportExportUrl({ format: "csv", ...range })}`;
}

/** The printable-HTML ("PDF") export link for the picked range (AC2). */
export function taxPdfHref(range: TaxRange): string {
  return `${API_BASE}${taxReportExportUrl({ format: "pdf", ...range })}`;
}

/** Default the range to the current calendar month (first-of-month → today). */
export function defaultTaxRange(now: Date = new Date()): TaxRange {
  const today = now.toISOString().slice(0, 10);
  return { fromDate: `${today.slice(0, 7)}-01`, toDate: today };
}
