import {
  peakHoursHeatmapViewModel,
  peakHoursHeatmapQuerySchema,
  type PeakHoursHeatmapDto,
  type PeakHoursHeatmapViewModel,
} from "@bm/contracts";

/**
 * Admin peak-hours-heatmap client logic (P3-E05-S05 / Story 27.5). The
 * `/operations/heatmap` admin page reads the admin-gated
 * `/admin/peak-hours-heatmap` API (credentialed — session cookie + CSRF) for the
 * picked date range + optional unit filter and renders the 7×24 weekday×hour grid
 * of active-session counts (AC1), filterable by unit (AC2), with the range capped
 * at 12 months (AC3). Framework-free so it unit-tests without React; the grid
 * shaping is reused from `@bm/contracts`.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** The peak-hours-heatmap DTO returned by the admin endpoint. */
export type PeakHoursHeatmap = PeakHoursHeatmapDto;

/** An inclusive date-range + unit filter (`unit` empty = all units). */
export interface HeatmapRange {
  fromDate: string;
  toDate: string;
  /** A single service unit, or "" for all units (AC2). */
  unit: string;
}

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Fetch the peak-hours heatmap for `range` from the admin-gated endpoint. Sends the
 * session cookie + CSRF token; omits the `unit` param when no unit is selected (all
 * units, AC2). Throws the server error message on a non-2xx (e.g. 400/401/403).
 */
export async function fetchPeakHoursHeatmap(range: HeatmapRange): Promise<PeakHoursHeatmap> {
  const params = new URLSearchParams({ fromDate: range.fromDate, toDate: range.toDate });
  if (range.unit) params.set("unit", range.unit);
  const res = await fetch(`${API_BASE}/admin/peak-hours-heatmap?${params.toString()}`, {
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & PeakHoursHeatmap;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Shape the heatmap into the labelled 7×24 grid + peak summary (AC1). Delegates to contracts. */
export function heatmapTiles(dto: PeakHoursHeatmap): PeakHoursHeatmapViewModel {
  return peakHoursHeatmapViewModel(dto);
}

/** Default the picker to the 30 days ending today (inclusive), all units. */
export function defaultHeatmapRange(now: Date = new Date()): HeatmapRange {
  const toMs = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const fromMs = toMs - 29 * 86_400_000; // 30 inclusive days
  return {
    fromDate: new Date(fromMs).toISOString().slice(0, 10),
    toDate: new Date(toMs).toISOString().slice(0, 10),
    unit: "",
  };
}

/**
 * True when the range is a valid, in-order selection within the 12-month cap (AC3).
 * Reuses the shared query schema so the client guard and the server can never
 * disagree; treats the empty-string unit as "all units".
 */
export function isValidHeatmapRange(range: HeatmapRange): boolean {
  return peakHoursHeatmapQuerySchema.safeParse(range).success;
}
