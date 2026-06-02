import {
  cohortRetentionViewModel,
  cohortRetentionQuerySchema,
  type CohortRetentionDto,
  type CohortRetentionViewModel,
} from "@bm/contracts";

/**
 * Admin cohort-retention client logic (Story 35.2). The `/operations/cohort-retention`
 * admin page reads the admin-gated `/admin/cohort-retention` API (credentialed —
 * session cookie + CSRF) for the picked signup-month range and renders the triangular
 * retention matrix (AC1): rows = signup month, columns = months-since-signup, cells = %
 * of the cohort still active (a paid touchpoint) in that offset month (AC2).
 * Framework-free so it unit-tests without React; the grid shaping is reused from
 * `@bm/contracts`.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** The cohort-retention DTO returned by the admin endpoint. */
export type CohortRetention = CohortRetentionDto;

/** An inclusive signup-month range filter (both `YYYY-MM`). */
export interface CohortRange {
  fromMonth: string;
  toMonth: string;
}

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Fetch the cohort-retention matrix for `range` from the admin-gated endpoint. Sends
 * the session cookie + CSRF token; throws the server error message on a non-2xx
 * (e.g. 400/401/403).
 */
export async function fetchCohortRetention(range: CohortRange): Promise<CohortRetention> {
  const params = new URLSearchParams({ fromMonth: range.fromMonth, toMonth: range.toMonth });
  const res = await fetch(`${API_BASE}/admin/cohort-retention?${params.toString()}`, {
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & CohortRetention;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Shape the matrix into the triangular grid (AC1). Delegates to contracts. */
export function cohortGrid(dto: CohortRetention): CohortRetentionViewModel {
  return cohortRetentionViewModel(dto);
}

/** A `Date` → its UTC calendar month, `YYYY-MM`. */
function toMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Default the picker to the 12 months ending this month (inclusive). */
export function defaultCohortRange(now: Date = new Date()): CohortRange {
  const toMonthStr = toMonth(now);
  const [y, m] = toMonthStr.split("-").map(Number);
  // Eleven months earlier → a 12-month inclusive window.
  const fromIdx = y! * 12 + (m! - 1) - 11;
  const fromY = Math.floor(fromIdx / 12);
  const fromM = (fromIdx % 12) + 1;
  return {
    fromMonth: `${String(fromY).padStart(4, "0")}-${String(fromM).padStart(2, "0")}`,
    toMonth: toMonthStr,
  };
}

/** True when the range is a valid, in-order month selection (drives the apply). */
export function isValidCohortRange(range: CohortRange): boolean {
  return cohortRetentionQuerySchema.safeParse(range).success;
}
