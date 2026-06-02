import {
  salonReportTileViewModel,
  salonReportDrillRows,
  type SalonDayReportDto,
  type SalonReportTileViewModel,
  type SalonStylistDrillRow,
} from "@bm/contracts";

/**
 * Admin salon-report client logic (P3-E03-S05 / Story 25.5). The `/salon-report`
 * admin page reads the admin-gated `/admin/salon-report` API (credentialed —
 * session cookie + CSRF) and renders the at-a-glance tile (AC1) + the per-stylist
 * drill-down (AC2). Framework-free so it unit-tests without React; the tile /
 * drill-down shaping is reused from `@bm/contracts` so the operational dashboard
 * (Epic 27) renders the identical tile.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** The salon-report DTO returned by the admin endpoint. */
export type SalonDayReport = SalonDayReportDto;

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Fetch the salon report for a date (or the server clock's today when omitted)
 * from the admin-gated endpoint. Sends the session cookie + CSRF token; throws the
 * server error message on a non-2xx (e.g. 401/403).
 */
export async function fetchSalonReport(date?: string): Promise<SalonDayReport> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  const res = await fetch(`${API_BASE}/admin/salon-report${qs}`, {
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & SalonDayReport;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Shape the headline tile (AC1). Delegates to the shared contract view-model. */
export function salonReportTile(report: SalonDayReport): SalonReportTileViewModel {
  return salonReportTileViewModel(report);
}

/** Shape the per-stylist drill-down rows (AC2). */
export function salonReportStylists(report: SalonDayReport): SalonStylistDrillRow[] {
  return salonReportDrillRows(report);
}
