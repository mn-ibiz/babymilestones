/**
 * Audit log viewer filter/query helpers (P1-E10-S03). Framework-agnostic +
 * dependency-free so they unit-test without a DOM and never pull server-only
 * code (the native argon2 binding) into the Next bundle.
 *
 * The viewer is strictly READ-ONLY: these helpers only shape the GET query the
 * page issues to `/admin/audit` (+ `/admin/audit/export`). The API
 * (`apps/api/src/routes/admin/audit.ts`) re-validates every filter and is the
 * sole source of truth; nothing here can mutate the audit log.
 */

/** Page size used by the viewer (mirrors the API default). */
export const AUDIT_PAGE_SIZE = 50;

/** The user-editable filter state of the audit viewer form. */
export interface AuditFilterState {
  actor: string;
  action: string;
  targetId: string;
  fromDate: string;
  toDate: string;
}

/** An empty filter state — the initial render lists the most-recent events. */
export const EMPTY_AUDIT_FILTERS: AuditFilterState = {
  actor: "",
  action: "",
  targetId: "",
  fromDate: "",
  toDate: "",
};

/**
 * Serialize the filter state (+ pagination) into a query string for the
 * read-only list/export endpoints. Blank fields are omitted so an empty form
 * issues a bare list request. Always begins with `?` when any param is present,
 * otherwise returns "".
 */
export function buildAuditQuery(
  filters: AuditFilterState,
  page: { limit: number; offset: number },
): string {
  const params = new URLSearchParams();
  const trimmed = {
    actor: filters.actor.trim(),
    action: filters.action.trim(),
    targetId: filters.targetId.trim(),
    fromDate: filters.fromDate.trim(),
    toDate: filters.toDate.trim(),
  };
  if (trimmed.actor) params.set("actor", trimmed.actor);
  if (trimmed.action) params.set("action", trimmed.action);
  if (trimmed.targetId) params.set("targetId", trimmed.targetId);
  if (trimmed.fromDate) params.set("fromDate", trimmed.fromDate);
  if (trimmed.toDate) params.set("toDate", trimmed.toDate);
  params.set("limit", String(page.limit));
  params.set("offset", String(page.offset));
  return `?${params.toString()}`;
}

/**
 * Same filters as {@link buildAuditQuery} but without pagination — used for the
 * CSV export link, which streams every matching row.
 */
export function buildAuditExportQuery(filters: AuditFilterState): string {
  const params = new URLSearchParams();
  const entries: Array<[keyof AuditFilterState, string]> = [
    ["actor", filters.actor.trim()],
    ["action", filters.action.trim()],
    ["targetId", filters.targetId.trim()],
    ["fromDate", filters.fromDate.trim()],
    ["toDate", filters.toDate.trim()],
  ];
  for (const [key, value] of entries) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Offset for a given zero-based page index. */
export function offsetForPage(pageIndex: number, limit: number = AUDIT_PAGE_SIZE): number {
  return Math.max(0, pageIndex) * limit;
}

/** Total number of pages for a result count (at least 1). */
export function pageCount(total: number, limit: number = AUDIT_PAGE_SIZE): number {
  if (total <= 0) return 1;
  return Math.ceil(total / limit);
}
