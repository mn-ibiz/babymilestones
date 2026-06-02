import {
  revenueByPeriodViewModel,
  revenueByPeriodExportUrl,
  revenueByPeriodQuerySchema,
  type RevenueByPeriodDto,
  type RevenueByPeriodViewModel,
} from "@bm/contracts";

/**
 * Admin revenue-by-unit-by-period client logic (P3-E05-S02 / Story 27.2). The
 * `/operations/revenue-trends` admin page reads the admin-gated
 * `/admin/revenue-by-period` API (credentialed — session cookie + CSRF) for the
 * picked date range and renders the per-unit chart series + period-over-period
 * delta (AC1), with a CSV export link using the same filter (AC2). Framework-free
 * so it unit-tests without React; the chart / delta shaping is reused from
 * `@bm/contracts`.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** The revenue-by-period DTO returned by the admin endpoint. */
export type RevenueByPeriod = RevenueByPeriodDto;

/** An inclusive date-range filter (both `YYYY-MM-DD`). */
export interface RevenueRange {
  fromDate: string;
  toDate: string;
}

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Fetch the revenue-by-period report for `range` from the admin-gated endpoint.
 * Sends the session cookie + CSRF token; throws the server error message on a
 * non-2xx (e.g. 400/401/403).
 */
export async function fetchRevenueByPeriod(range: RevenueRange): Promise<RevenueByPeriod> {
  const params = new URLSearchParams({ fromDate: range.fromDate, toDate: range.toDate });
  const res = await fetch(`${API_BASE}/admin/revenue-by-period?${params.toString()}`, {
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & RevenueByPeriod;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Shape the report into the chart series + headline total (AC1). Delegates to contracts. */
export function revenueTiles(dto: RevenueByPeriod): RevenueByPeriodViewModel {
  return revenueByPeriodViewModel(dto);
}

/** The CSV export link for the picked range (AC2), against the API base. */
export function revenueExportHref(range: RevenueRange): string {
  return `${API_BASE}${revenueByPeriodExportUrl(range)}`;
}

/** Default the picker to the 7 days ending today (inclusive). */
export function defaultRevenueRange(now: Date = new Date()): RevenueRange {
  const toMs = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const fromMs = toMs - 6 * 86_400_000; // 7 inclusive days
  return {
    fromDate: new Date(fromMs).toISOString().slice(0, 10),
    toDate: new Date(toMs).toISOString().slice(0, 10),
  };
}

/** True when the range is a valid, in-order selection (drives the apply/export). */
export function isValidRange(range: RevenueRange): boolean {
  return revenueByPeriodQuerySchema.safeParse(range).success;
}
