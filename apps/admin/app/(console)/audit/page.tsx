"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AUDIT_PAGE_SIZE,
  EMPTY_AUDIT_FILTERS,
  buildAuditExportQuery,
  buildAuditQuery,
  offsetForPage,
  pageCount,
  type AuditFilterState,
} from "../../../lib/audit-filters";

/**
 * Audit log viewer (P1-E10-S03). A READ-ONLY screen: an admin searches the
 * audit trail by actor, action, target id, and date range (AC1), pages through
 * the results (AC2), and downloads a filtered CSV (AC2). There is no create,
 * edit, or delete affordance — the audit log is immutable (AC3). The API
 * (`/admin/audit`) re-checks the `read audit` grant and is the source of truth.
 */
interface AuditEvent {
  id: string;
  actorUserId: string | null;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  createdAt: string;
}

export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilterState>(EMPTY_AUDIT_FILTERS);
  const [applied, setApplied] = useState<AuditFilterState>(EMPTY_AUDIT_FILTERS);
  const [pageIndex, setPageIndex] = useState(0);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = buildAuditQuery(applied, {
      limit: AUDIT_PAGE_SIZE,
      offset: offsetForPage(pageIndex),
    });
    const res = await fetch(`/admin/audit${query}`, { credentials: "include" });
    if (!res.ok) {
      setError(res.status === 403 ? "You do not have access to the audit log." : "Failed to load.");
      return;
    }
    setError(null);
    const body = (await res.json()) as { events: AuditEvent[]; total: number };
    setEvents(body.events);
    setTotal(body.total);
  }, [applied, pageIndex]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setPageIndex(0);
    setApplied(filters);
  }, [filters]);

  const set = (key: keyof AuditFilterState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters((f) => ({ ...f, [key]: e.target.value }));

  const pages = pageCount(total);
  const exportHref = `/admin/audit/export${buildAuditExportQuery(applied)}`;

  return (
    <section>
      <h1>Audit log</h1>
      <p>
        A read-only record of who did what, when, and to which record. Filter to investigate a
        dispute, then export the matching events as CSV.
      </p>

      <form onSubmit={onSearch} aria-label="Audit filters">
        <label>
          Actor (user id)
          <input name="actor" value={filters.actor} onChange={set("actor")} placeholder="user id" />
        </label>
        <label>
          Action
          <input
            name="action"
            value={filters.action}
            onChange={set("action")}
            placeholder="e.g. wallet.topup"
          />
        </label>
        <label>
          Target id
          <input name="targetId" value={filters.targetId} onChange={set("targetId")} />
        </label>
        <label>
          From
          <input name="fromDate" type="date" value={filters.fromDate} onChange={set("fromDate")} />
        </label>
        <label>
          To
          <input name="toDate" type="date" value={filters.toDate} onChange={set("toDate")} />
        </label>
        <button type="submit">Search</button>
        <a href={exportHref} data-export-csv>
          Export CSV
        </a>
      </form>

      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{e.createdAt}</td>
                  <td>{e.actorUserId ?? "system"}</td>
                  <td>{e.action}</td>
                  <td>{[e.targetTable, e.targetId].filter(Boolean).join(" / ") || "—"}</td>
                </tr>
              ))}
              {events.length === 0 ? (
                <tr>
                  <td colSpan={4}>No matching audit events.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <nav aria-label="Pagination">
            <button
              type="button"
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={pageIndex === 0}
            >
              Previous
            </button>
            <span data-page-status>
              Page {pageIndex + 1} of {pages} ({total} events)
            </span>
            <button
              type="button"
              onClick={() => setPageIndex((p) => Math.min(pages - 1, p + 1))}
              disabled={pageIndex >= pages - 1}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
