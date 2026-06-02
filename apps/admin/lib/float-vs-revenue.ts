import {
  floatVsRevenueViewModel,
  type FloatVsRevenueDto,
  type FloatVsRevenueViewModel,
} from "@bm/contracts";

/**
 * Admin wallet-float-vs-revenue client logic (P5-E05-S04 / Story 35.4). The
 * `/operations/float-vs-revenue` admin page reads the financial-reporting-gated
 * `/admin/float-vs-revenue` API (credentialed — session cookie + CSRF) for the
 * optional `asOf` snapshot day + window length and renders the daily snapshot KPIs
 * — customer-wallet liability, segregated balance, prior-day delta, revenue earned
 * that day (AC1) — plus the 90-day float-vs-revenue chart series (AC2).
 * Framework-free so it unit-tests without React; the KPI / series shaping is reused
 * from `@bm/contracts`.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** The float-vs-revenue DTO returned by the admin endpoint. */
export type FloatVsRevenue = FloatVsRevenueDto;

/** The optional snapshot day + window length filter. */
export interface FloatVsRevenueFilter {
  /** Snapshot day (`YYYY-MM-DD`); defaults to today server-side. */
  asOf?: string;
  /** Window length in days; defaults to 90 server-side. */
  days?: number;
}

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Fetch the float-vs-revenue report from the admin-gated endpoint. Sends the
 * session cookie + CSRF token; throws the server error message on a non-2xx (e.g.
 * 400/401/403).
 */
export async function fetchFloatVsRevenue(filter: FloatVsRevenueFilter): Promise<FloatVsRevenue> {
  const params = new URLSearchParams();
  if (filter.asOf) params.set("asOf", filter.asOf);
  if (filter.days != null) params.set("days", String(filter.days));
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/admin/float-vs-revenue${qs ? `?${qs}` : ""}`, {
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & FloatVsRevenue;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Shape the report into the snapshot KPIs + chart series (AC1/AC2). Delegates to contracts. */
export function floatVsRevenueTiles(dto: FloatVsRevenue): FloatVsRevenueViewModel {
  return floatVsRevenueViewModel(dto);
}
