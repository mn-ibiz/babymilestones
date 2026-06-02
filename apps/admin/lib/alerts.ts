import { adminAlertRows, type AdminAlertDto, type AdminAlertRowView } from "@bm/contracts";

/**
 * Admin in-app alerts client logic (P6-E04-S03 / Story 34.3). The admin shell's
 * bell reads the admin-gated `/admin/alerts` API (credentialed — session cookie +
 * CSRF) for the UNREAD alerts and renders a small list; each row links to the
 * feedback detail (AC2). An admin can DISMISS an alert (drops it off the list).
 * Framework-free so it unit-tests without React; the row shaping is reused from
 * `@bm/contracts` (`adminAlertRows`).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** An admin in-app alert DTO returned by the endpoint. */
export type AdminAlert = AdminAlertDto;
/** A render-ready alert row (carries the detail `href`). */
export type AdminAlertRow = AdminAlertRowView;

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: { "x-csrf-token": readCsrfToken(), ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** The unread-alerts response from the admin endpoint (the bell list). */
export interface AdminAlertsResponse {
  alerts: AdminAlert[];
  count: number;
}

/**
 * Fetch the UNREAD admin alerts (the bell list, AC1). Sends the session cookie +
 * CSRF token; throws the server error message on a non-2xx (e.g. 401/403).
 */
export async function fetchAdminAlerts(): Promise<AdminAlertsResponse> {
  return requestJson<AdminAlertsResponse>("/admin/alerts");
}

/** Dismiss an alert by id (drops it off the unread list). The API audits it. */
export async function dismissAdminAlert(id: string): Promise<{ id: string; dismissed: boolean }> {
  return requestJson<{ id: string; dismissed: boolean }>(`/admin/alerts/${id}/dismiss`, {
    method: "POST",
  });
}

/** Shape the alerts into render-ready rows (newest-first, each links to detail, AC2). */
export function adminAlertView(alerts: readonly AdminAlert[]): AdminAlertRow[] {
  return adminAlertRows(alerts);
}

/** The unread count for the bell badge. */
export function unreadAlertCount(alerts: readonly AdminAlert[]): number {
  return alerts.length;
}
