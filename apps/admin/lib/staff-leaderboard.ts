import {
  staffLeaderboardRows,
  staffCommissionDrilldownView,
  staffLeaderboardRoleOptions,
  staffLeaderboardQuerySchema,
  type StaffLeaderboardDto,
  type StaffCommissionDrilldownDto,
  type StaffLeaderboardRow,
  type StaffCommissionDrilldownView,
  type StaffLeaderboardRoleOption,
  type AttributionRole,
} from "@bm/contracts";

/**
 * Admin top-staff-leaderboard client logic (P3-E05-S03 / Story 27.3). The
 * `/operations/leaderboard` admin page reads the admin-gated
 * `/admin/staff-leaderboard` API (credentialed — session cookie + CSRF) for the
 * picked date range + optional role filter and renders per-staff revenue / service
 * count / average ticket (AC1), filterable by role (AC2); each row clicks through
 * to `/operations/leaderboard/:staffId`, which reads the per-staff commission
 * drill-down (AC3). Framework-free so it unit-tests without React; the row /
 * drill-down / role-option shaping is reused from `@bm/contracts`.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** The leaderboard DTO returned by the admin endpoint. */
export type StaffLeaderboard = StaffLeaderboardDto;
/** The per-staff commission drill-down DTO. */
export type StaffCommissionDrilldown = StaffCommissionDrilldownDto;

/** An inclusive date range + optional role filter (AC1/AC2). */
export interface LeaderboardFilter {
  fromDate: string;
  toDate: string;
  /** Empty string = all roles (no filter). */
  role: "" | AttributionRole;
}

/** An inclusive date range (the drill-down carries no role). */
export interface LeaderboardRange {
  fromDate: string;
  toDate: string;
}

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

async function getCredentialed<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

/**
 * Fetch the leaderboard for `filter` from the admin-gated endpoint. Sends the
 * session cookie + CSRF token; the role param is omitted when no role is selected
 * (AC2). Throws the server error message on a non-2xx (e.g. 400/401/403).
 */
export async function fetchStaffLeaderboard(filter: LeaderboardFilter): Promise<StaffLeaderboard> {
  const params = new URLSearchParams({ fromDate: filter.fromDate, toDate: filter.toDate });
  if (filter.role) params.set("role", filter.role);
  return getCredentialed<StaffLeaderboard>(`/admin/staff-leaderboard?${params.toString()}`);
}

/** Fetch one staff member's commission totals for the same range (AC3). Credentialed. */
export async function fetchStaffCommission(
  staffId: string,
  range: LeaderboardRange,
): Promise<StaffCommissionDrilldown> {
  const params = new URLSearchParams({ fromDate: range.fromDate, toDate: range.toDate });
  return getCredentialed<StaffCommissionDrilldown>(
    `/admin/staff-leaderboard/${encodeURIComponent(staffId)}/commission?${params.toString()}`,
  );
}

/** Shape the leaderboard into render-ready rows (AC1/AC3). Delegates to contracts. */
export function leaderboardRows(dto: StaffLeaderboard): StaffLeaderboardRow[] {
  return staffLeaderboardRows(dto);
}

/** Shape the commission drill-down into formatted totals (AC3). Delegates to contracts. */
export function commissionView(dto: StaffCommissionDrilldown): StaffCommissionDrilldownView {
  return staffCommissionDrilldownView(dto);
}

/** The role-filter options (AC2). Delegates to contracts. */
export function roleOptions(): StaffLeaderboardRoleOption[] {
  return staffLeaderboardRoleOptions();
}

/** Default the picker to the 7 days ending today (inclusive). */
export function defaultLeaderboardRange(now: Date = new Date()): LeaderboardRange {
  const toMs = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const fromMs = toMs - 6 * 86_400_000; // 7 inclusive days
  return {
    fromDate: new Date(fromMs).toISOString().slice(0, 10),
    toDate: new Date(toMs).toISOString().slice(0, 10),
  };
}

/** True when the range is a valid, in-order selection (drives apply). */
export function isValidLeaderboardRange(range: LeaderboardRange): boolean {
  return staffLeaderboardQuerySchema.safeParse(range).success;
}
