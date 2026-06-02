import {
  repeatAttendanceViewModel,
  repeatAttendanceQuerySchema,
  type RepeatAttendanceDto,
  type RepeatAttendanceViewModel,
} from "@bm/contracts";

/**
 * Admin repeat-attendance client logic (P6-E06-S03 / Story 35.3). The
 * `/operations/repeat-attendance` admin page reads the admin-gated
 * `/admin/repeat-attendance` API (credentialed — session cookie + CSRF) for the
 * picked date range and renders the per-class table — total attendees, repeat rate,
 * average classes per attendee (AC1) — filterable by date range (AC2). Framework-free
 * so it unit-tests without React; the table shaping is reused from `@bm/contracts`.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** The repeat-attendance DTO returned by the admin endpoint. */
export type RepeatAttendanceReport = RepeatAttendanceDto;

/** An inclusive date range (`YYYY-MM-DD`). */
export interface RepeatAttendanceRange {
  fromDate: string;
  toDate: string;
}

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Fetch the repeat-attendance report for `range` from the admin-gated endpoint.
 * Sends the session cookie + CSRF token. Throws the server error message on a
 * non-2xx (e.g. 400/401/403).
 */
export async function fetchRepeatAttendance(range: RepeatAttendanceRange): Promise<RepeatAttendanceReport> {
  const params = new URLSearchParams({ fromDate: range.fromDate, toDate: range.toDate });
  const res = await fetch(`${API_BASE}/admin/repeat-attendance?${params.toString()}`, {
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & RepeatAttendanceReport;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Shape the report into the labelled per-class table + summary (AC1). Delegates to contracts. */
export function repeatAttendanceTable(dto: RepeatAttendanceReport): RepeatAttendanceViewModel {
  return repeatAttendanceViewModel(dto);
}

/** Default the picker to the 30 days ending today (inclusive). */
export function defaultRepeatAttendanceRange(now: Date = new Date()): RepeatAttendanceRange {
  const toMs = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const fromMs = toMs - 29 * 86_400_000; // 30 inclusive days
  return {
    fromDate: new Date(fromMs).toISOString().slice(0, 10),
    toDate: new Date(toMs).toISOString().slice(0, 10),
  };
}

/**
 * True when the range is a valid, in-order selection (AC2). Reuses the shared query
 * schema so the client guard and the server can never disagree.
 */
export function isValidRepeatAttendanceRange(range: RepeatAttendanceRange): boolean {
  return repeatAttendanceQuerySchema.safeParse(range).success;
}
