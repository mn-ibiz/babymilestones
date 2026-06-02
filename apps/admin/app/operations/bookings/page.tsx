"use client";

import React, { useEffect, useState } from "react";
import {
  fetchOperationsDashboard,
  operationsRevenueByUnit,
  type OperationsDashboard,
} from "../../../lib/operations-dashboard";

/**
 * Bookings drill-down (P3-E05-S01 / Story 27.1 AC2). The dashboard bookings tile
 * clicks through here: today's total bookings count plus the per-unit revenue
 * breakdown that backs it. Reads the same admin-gated
 * `/admin/operations-dashboard` API (read-only, admin/super_admin/treasury).
 */
export default function BookingsDrillDownPage() {
  const [dashboard, setDashboard] = useState<OperationsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOperationsDashboard()
      .then(setDashboard)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load bookings"),
      );
  }, []);

  const count = dashboard ? dashboard.bookingsCount.toLocaleString("en-KE") : "—";
  const byUnit = dashboard ? operationsRevenueByUnit(dashboard) : [];

  return (
    <main>
      <h1>Bookings today</h1>
      <p>
        <a href="/operations">&larr; Back to today at a glance</a>
      </p>

      {error && <p role="alert">{error}</p>}

      <p>
        Total bookings today: <strong>{count}</strong>
      </p>

      <section aria-label="Revenue by unit">
        <h2>By unit</h2>
        {byUnit.length === 0 ? (
          <p>Loading…</p>
        ) : (
          <ul>
            {byUnit.map((u) => (
              <li key={u.unit}>
                {u.label}: {u.value}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
