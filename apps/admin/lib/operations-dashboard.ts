import {
  operationsDashboardTiles,
  operationsTopStaffRows,
  type OperationsDashboardDto,
  type OperationsDashboardViewModel,
  type OperationsTopStaffRow,
  type OperationsUnitRevenueRow,
} from "@bm/contracts";

/**
 * Admin daily-operations-dashboard client logic (P3-E05-S01 / Story 27.1). The
 * `/operations` admin page reads the admin-gated `/admin/operations-dashboard`
 * API (credentialed — session cookie + CSRF) and renders the five headline tiles
 * (AC1), each clicking through to a drill-down route (AC2), refreshed every 60s
 * (AC3). Framework-free so it unit-tests without React; the tile / drill-down
 * shaping is reused from `@bm/contracts`.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** Client poll interval (AC3): refetch the dashboard every 60 seconds. */
export const DASHBOARD_REFRESH_MS = 60_000;

/** The operations dashboard DTO returned by the admin endpoint. */
export type OperationsDashboard = OperationsDashboardDto;

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Fetch the daily-operations dashboard from the admin-gated endpoint. Sends the
 * session cookie + CSRF token; throws the server error message on a non-2xx
 * (e.g. 401/403).
 */
export async function fetchOperationsDashboard(): Promise<OperationsDashboard> {
  const res = await fetch(`${API_BASE}/admin/operations-dashboard`, {
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & OperationsDashboard;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Shape the five headline tiles (AC1) + per-unit revenue. Delegates to contracts. */
export function operationsTiles(dto: OperationsDashboard): OperationsDashboardViewModel {
  return operationsDashboardTiles(dto);
}

/** Shape the per-unit revenue drill-down rows (AC1/AC2). */
export function operationsRevenueByUnit(dto: OperationsDashboard): OperationsUnitRevenueRow[] {
  return operationsDashboardTiles(dto).revenueByUnit;
}

/** Shape the top-staff drill-down rows (AC1/AC2). */
export function operationsTopStaff(dto: OperationsDashboard): OperationsTopStaffRow[] {
  return operationsTopStaffRows(dto);
}
