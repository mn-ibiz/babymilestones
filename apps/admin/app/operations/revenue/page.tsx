"use client";

import React, { useEffect, useState } from "react";
import {
  fetchOperationsDashboard,
  operationsRevenueByUnit,
  operationsTiles,
  type OperationsDashboard,
} from "../../../lib/operations-dashboard";

/**
 * Revenue drill-down (P3-E05-S01 / Story 27.1 AC2). The dashboard revenue tile —
 * and each non-salon unit row — clicks through here. Shows today's revenue total
 * plus the full per-unit breakdown, highlighting the `?unit=` the caller arrived
 * from (read client-side to keep this SSR-simple). Reads the same admin-gated
 * `/admin/operations-dashboard` API (read-only, admin/super_admin/treasury).
 */
export default function RevenueDrillDownPage() {
  const [dashboard, setDashboard] = useState<OperationsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setUnit(new URLSearchParams(window.location.search).get("unit"));
    }
    fetchOperationsDashboard()
      .then(setDashboard)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load revenue"),
      );
  }, []);

  const total = dashboard ? operationsTiles(dashboard).tiles.find((t) => t.key === "revenue")?.value : null;
  const byUnit = dashboard ? operationsRevenueByUnit(dashboard) : [];

  return (
    <main>
      <h1>Today&rsquo;s revenue</h1>
      <p>
        <a href="/operations">&larr; Back to today at a glance</a>
      </p>

      {error && <p role="alert">{error}</p>}

      <p>
        Total revenue today: <strong>{total ?? "—"}</strong>
      </p>

      <section aria-label="Revenue by unit">
        <h2>By unit</h2>
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
                <tr key={u.unit} aria-current={u.unit === unit ? "true" : undefined}>
                  <td>{u.label}</td>
                  <td>{u.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
