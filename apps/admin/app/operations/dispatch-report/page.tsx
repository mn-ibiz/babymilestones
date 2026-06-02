"use client";

import React, { useEffect, useState } from "react";
import {
  fetchDailyDispatch,
  dispatchTiles,
  dispatchExportHref,
  defaultDispatchDate,
  isValidDispatchDate,
  type DailyDispatchReport,
} from "../../../lib/daily-dispatch";

/**
 * Daily dispatch report (P4-E04-S04 / Story 29.4). Shop ops pick a day (defaults to
 * today — AC4) and see, for the WooCommerce-originated orders (AC1): a count per
 * local_status, the total order count + value (KES), the average pack time
 * (new→ready) and dispatch time (ready→dispatched) (AC2), and a "Sync health" row
 * with the count of stuck/failed Woo writebacks linking to the dead-letter view
 * (AC5). The same day exports to CSV (AC3). Reads the admin-gated
 * `/admin/daily-dispatch` API (admin / super_admin / treasury).
 */
export default function DispatchReportPage() {
  const [date, setDate] = useState<string>(() => defaultDispatchDate());
  const [report, setReport] = useState<DailyDispatchReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(d: string) {
    setError(null);
    fetchDailyDispatch(d)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load the dispatch report"));
  }

  useEffect(() => {
    load(date);
  }, []);

  const vm = report ? dispatchTiles(report) : null;
  const valid = isValidDispatchDate(date);

  return (
    <main>
      <h1>Daily dispatch report</h1>
      <p>
        <a href="/operations">&larr; Back to today at a glance</a>
      </p>

      <form
        aria-label="Report date"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) load(date);
        }}
      >
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="submit" disabled={!valid}>
          Apply
        </button>
        {valid && (
          <a href={dispatchExportHref(date)} download>
            Export CSV
          </a>
        )}
      </form>

      {!valid && <p role="alert">Pick a valid date.</p>}
      {error && <p role="alert">{error}</p>}

      {vm && (
        <>
          <section aria-label="Order status counts">
            <h2>Orders by status</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Orders</th>
                </tr>
              </thead>
              <tbody>
                {vm.rows.map((r) => (
                  <tr key={r.status}>
                    <td>{r.label}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Total orders</strong>
                  </td>
                  <td>
                    <strong>{vm.totalOrders}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section aria-label="Dispatch summary">
            <h2>Summary</h2>
            <dl>
              <dt>Total value</dt>
              <dd>{vm.totalValue}</dd>
              <dt>Average pack time (new → ready)</dt>
              <dd>{vm.avgPack}</dd>
              <dt>Average dispatch time (ready → dispatched)</dt>
              <dd>{vm.avgDispatch}</dd>
            </dl>
          </section>

          <section aria-label="Sync health">
            <h2>Sync health</h2>
            <p>
              <span data-test="sync-health-count">{vm.syncHealth.count}</span> order(s) with stuck or failed Woo
              writebacks.{" "}
              <a href={vm.syncHealth.href}>View dead-lettered writebacks</a>
            </p>
          </section>
        </>
      )}

      {!vm && !error && <p>Loading…</p>}
    </main>
  );
}
