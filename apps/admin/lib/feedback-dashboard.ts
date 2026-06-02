import {
  feedbackUnitRows,
  feedbackStaffRows,
  feedbackResponseRows,
  feedbackDistributionBars,
  type FeedbackDashboardDto,
  type FeedbackResponseDto,
  type FeedbackUnitRow,
  type FeedbackStaffRow,
  type FeedbackResponseRowView,
  type FeedbackDistributionBar,
} from "@bm/contracts";

/**
 * Admin feedback-dashboard client logic (P6-E04-S02 / Story 34.2). The `/feedback`
 * admin page reads the admin-gated `/admin/feedback-dashboard` API (credentialed —
 * session cookie + CSRF) and renders the per-unit + per-staff tables (AC1),
 * filterable by date range (AC2). Clicking a unit/staff drills into the individual
 * responses, ANONYMISED by default; an admin can de-anonymise (reveal the parent)
 * via the `reveal` flag, which the API audits (AC3). Framework-free so it
 * unit-tests without React; the view-model shaping is reused from `@bm/contracts`.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** The feedback dashboard DTO returned by the admin endpoint. */
export type FeedbackDashboard = FeedbackDashboardDto;
/** An individual feedback response DTO (anonymised, or de-anonymised). */
export type FeedbackResponse = FeedbackResponseDto;

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export interface FeedbackDateRange {
  fromDate: string;
  toDate: string;
}

/**
 * Fetch the feedback dashboard for the date range from the admin-gated endpoint
 * (AC1/AC2). Sends the session cookie + CSRF token; throws the server error
 * message on a non-2xx (e.g. 401/403).
 */
export async function fetchFeedbackDashboard(range: FeedbackDateRange): Promise<FeedbackDashboard> {
  const qs = new URLSearchParams({ fromDate: range.fromDate, toDate: range.toDate });
  return getJson<FeedbackDashboard>(`/admin/feedback-dashboard?${qs.toString()}`);
}

export interface FeedbackResponsesQuery extends FeedbackDateRange {
  /** Restrict to one dashboard unit. */
  unit?: string;
  /** Restrict to one attributed staff member. */
  staffId?: string;
  /** De-anonymise: reveal the parent identity. The API audits this (AC3). */
  reveal?: boolean;
}

/**
 * Fetch the individual responses for a unit / staff over the range (AC3).
 * ANONYMISED by default; `reveal: true` requests the de-anonymised variant (the
 * API gates it to admin / super_admin and writes a `feedback.deanonymised` audit).
 */
export async function fetchFeedbackResponses(
  query: FeedbackResponsesQuery,
): Promise<{ responses: FeedbackResponse[] }> {
  const params = new URLSearchParams({ fromDate: query.fromDate, toDate: query.toDate });
  if (query.unit) params.set("unit", query.unit);
  if (query.staffId) params.set("staffId", query.staffId);
  if (query.reveal) params.set("reveal", "true");
  return getJson<{ responses: FeedbackResponse[] }>(`/admin/feedback-dashboard/responses?${params.toString()}`);
}

/** Shape the per-unit aggregates into render-ready rows (AC1). Delegates to contracts. */
export function feedbackUnitView(dto: FeedbackDashboard): FeedbackUnitRow[] {
  return feedbackUnitRows(dto);
}

/** Shape the per-staff aggregates into render-ready rows with the guardrail (AC1). */
export function feedbackStaffView(dto: FeedbackDashboard): FeedbackStaffRow[] {
  return feedbackStaffRows(dto);
}

/** Shape a 0..5 distribution histogram into render-ready bars (AC1). */
export function feedbackDistributionView(distribution: readonly number[]): FeedbackDistributionBar[] {
  return feedbackDistributionBars(distribution);
}

/** Shape the individual responses into render-ready rows (AC3). */
export function feedbackResponsesView(responses: readonly FeedbackResponse[]): FeedbackResponseRowView[] {
  return feedbackResponseRows(responses);
}
