import {
  dailyDispatchViewModel,
  dailyDispatchExportUrl,
  dailyDispatchQuerySchema,
  type DailyDispatchReportDto,
  type DailyDispatchViewModel,
} from "@bm/contracts";

/**
 * Admin daily dispatch client logic (P4-E04-S04 / Story 29.4). The
 * `/operations/dispatch-report` admin page reads the admin-gated
 * `/admin/daily-dispatch` API (credentialed — session cookie + CSRF) for the picked
 * day and renders the status-count table + total value + pack/dispatch averages
 * (AC2) + the sync-health row linking to the 29.7 dead-letter view (AC5), with a CSV
 * export link using the same date (AC3). Framework-free so it unit-tests without
 * React; the table / figure shaping is reused from `@bm/contracts`.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** The daily dispatch DTO returned by the admin endpoint. */
export type DailyDispatchReport = DailyDispatchReportDto;

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Fetch the daily dispatch report for `date` from the admin-gated endpoint. Sends
 * the session cookie + CSRF token; throws the server error message on a non-2xx
 * (e.g. 400/401/403).
 */
export async function fetchDailyDispatch(date: string): Promise<DailyDispatchReport> {
  const params = new URLSearchParams({ date });
  const res = await fetch(`${API_BASE}/admin/daily-dispatch?${params.toString()}`, {
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & DailyDispatchReport;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Shape the report into the status table + headline figures (AC2/AC5). Delegates to contracts. */
export function dispatchTiles(dto: DailyDispatchReport): DailyDispatchViewModel {
  return dailyDispatchViewModel(dto);
}

/** The CSV export link for the picked date (AC3), against the API base. */
export function dispatchExportHref(date: string): string {
  return `${API_BASE}${dailyDispatchExportUrl({ date })}`;
}

/** Default the date filter to today (AC4). */
export function defaultDispatchDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** True when the date is a valid `YYYY-MM-DD` (drives the apply/export). */
export function isValidDispatchDate(date: string): boolean {
  return dailyDispatchQuerySchema.safeParse({ date }).success && date !== "";
}
