import {
  PNL_GRANULARITIES,
  pnlReportExportUrl,
  type PnlComparisonDto,
  type PnlGranularity,
} from "@bm/contracts";

/**
 * Admin consolidated-P&L client logic (P6-E05-S01 / Story 35.1). The `/pnl` admin
 * page reads the admin-gated `/admin/pnl-report` API (credentialed — session
 * cookie + CSRF) for the picked anchor + granularity and renders the per-unit P&L
 * with the MoM / YoY comparison (AC1/AC2), with CSV ("Excel") + printable-HTML
 * ("PDF") export links using the same filter (AC3). Framework-free so it unit-tests
 * without React; the export URLs are reused from `@bm/contracts`.
 *
 * P&L is sensitive: the API gates it to the finance/report roles (accountant /
 * admin / super_admin / treasury); this page reads it credentialed and the server
 * is the authority.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** The P&L comparison DTO returned by the admin endpoint. */
export type PnlComparison = PnlComparisonDto;

/** An anchor (any `YYYY-MM-DD` in the period) + the granularity. */
export interface PnlQuery {
  anchor: string;
  granularity: PnlGranularity;
}

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Fetch the consolidated P&L for `query` from the admin-gated endpoint. Sends the
 * session cookie + CSRF token; throws the server error message on a non-2xx
 * (e.g. 400/401/403).
 */
export async function fetchPnlReport(query: PnlQuery): Promise<PnlComparison> {
  const params = new URLSearchParams({ anchor: query.anchor, granularity: query.granularity });
  const res = await fetch(`${API_BASE}/admin/pnl-report?${params.toString()}`, {
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & PnlComparison;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** The CSV ("Excel") export link for the picked query (AC3), against the API base. */
export function pnlCsvHref(query: PnlQuery): string {
  return `${API_BASE}${pnlReportExportUrl({ format: "csv", ...query })}`;
}

/** The printable-HTML ("PDF") export link for the picked query (AC3). */
export function pnlPdfHref(query: PnlQuery): string {
  return `${API_BASE}${pnlReportExportUrl({ format: "pdf", ...query })}`;
}

/** Default the anchor to today (`YYYY-MM-DD`). */
export function defaultPnlAnchor(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** True when `value` is a supported granularity (drives the picker). */
export function isValidPnlGranularity(value: string): value is PnlGranularity {
  return (PNL_GRANULARITIES as readonly string[]).includes(value);
}
