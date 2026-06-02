"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  DASHBOARD_REFRESH_MS,
  fetchOperationsDashboard,
  operationsRevenueByUnit,
  operationsTiles,
  operationsTopStaff,
  type OperationsDashboard,
} from "../../lib/operations-dashboard";

/**
 * Daily operations dashboard (P3-E05-S01 / Story 27.1).
 *
 * One screen showing what is happening TODAY across every unit: five headline
 * tiles — today's revenue (total + per-unit), bookings count, active sessions,
 * outstanding balances total, and top staff today (AC1). Every number clicks
 * through to a drill-down route (AC2). The page auto-refreshes every 60s (AC3,
 * mirroring the 60s cache / island-refresh pattern). Admin-gated server-side: the
 * `/admin/operations-dashboard` API enforces admin / super_admin / treasury (AC4)
 * — read-only; this page reads it credentialed.
 */
export default function OperationsDashboardPage() {
  const [dashboard, setDashboard] = useState<OperationsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setError(null);
    fetchOperationsDashboard()
      .then(setDashboard)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load the dashboard"),
      );
  }, []);

  // AC3: fetch on mount, then poll every 60s so the tiles stay current.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, DASHBOARD_REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const tiles = dashboard ? operationsTiles(dashboard).tiles : null;
  const byUnit = dashboard ? operationsRevenueByUnit(dashboard) : [];
  const topStaff = dashboard ? operationsTopStaff(dashboard) : [];

  // The labels render on first paint (before the fetch resolves) so the tile grid
  // is present immediately; values fill in once the dashboard loads (AC1).
  const TILE_LABELS: { key: string; label: string; href: string }[] = [
    { key: "revenue", label: "Today's revenue", href: "/operations/revenue" },
    { key: "bookings", label: "Bookings today", href: "/operations/bookings" },
    { key: "activeSessions", label: "Active sessions", href: "/reception/attendance" },
    { key: "outstanding", label: "Outstanding balances", href: "/treasury/reconciliation" },
    { key: "topStaff", label: "Top staff today", href: "/staff-earnings" },
  ];
  const valueFor = (key: string): string => tiles?.find((t) => t.key === key)?.value ?? "—";

  return (
    <main>
      <h1>Today at a glance</h1>
      <p>Live across every unit — revenue, bookings, sessions, outstanding balances, and top staff.</p>
      <p>
        <a href="/operations/revenue-trends">Revenue by unit, by period &rarr;</a>
      </p>
      <p>
        <a href="/operations/leaderboard">Top staff leaderboard &rarr;</a>
      </p>
      <p>
        <a href="/operations/wallet-aging">Wallet aging report &rarr;</a>
      </p>
      <p>
        <a href="/operations/float-vs-revenue">Wallet float vs revenue &rarr;</a>
      </p>
      <p>
        <a href="/operations/heatmap">Peak hours heatmap &rarr;</a>
      </p>
      <p>
        <a href="/operations/cohort-retention">Cohort retention by signup month &rarr;</a>
      </p>

      {error && <p role="alert">{error}</p>}

      {/* AC1/AC2: the five headline tiles. Each number clicks through to a
          drill-down route. */}
      <section aria-label="Operations tiles">
        <dl>
          {TILE_LABELS.map((t) => (
            <div key={t.key}>
              <dt>{t.label}</dt>
              <dd>
                <a href={t.href}>{valueFor(t.key)}</a>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* AC1/AC2: revenue per unit — each unit clicks through to a drill-down. */}
      <section aria-label="Revenue by unit">
        <h2>Revenue by unit</h2>
        {byUnit.length === 0 ? (
          <p>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Unit</th>
                <th scope="col">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {byUnit.map((u) => (
                <tr key={u.unit}>
                  <td>{u.label}</td>
                  <td>
                    <a href={u.href}>{u.value}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* AC1/AC2: top staff today — each row links to staff earnings. */}
      <section aria-label="Top staff today">
        <h2>Top staff today</h2>
        {dashboard === null ? (
          <p>Loading…</p>
        ) : topStaff.length === 0 ? (
          <p>No attributed bookings yet today.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Staff</th>
                <th scope="col">Bookings</th>
                <th scope="col">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topStaff.map((s) => (
                <tr key={s.staffId}>
                  <td>
                    <a href={s.href}>{s.staffName}</a>
                  </td>
                  <td>{s.bookings}</td>
                  <td>{s.revenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
