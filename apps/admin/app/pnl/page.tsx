"use client";

import React, { useEffect, useState } from "react";
import {
  centsToKes,
  pnlUnitLabel,
  type PnlGranularity,
  type PnlUnit,
} from "@bm/contracts";
import {
  fetchPnlReport,
  pnlCsvHref,
  pnlPdfHref,
  defaultPnlAnchor,
  isValidPnlGranularity,
  type PnlComparison,
} from "../../lib/pnl-report";

/**
 * Consolidated P&L by period (P6-E05-S01 / Story 35.1). The accountant/owner picks
 * an anchor date + a granularity (this month vs last month, or this year vs last
 * year — AC2) and sees the per-unit REVENUE / DIRECT COSTS / EXPENSES / NET plus
 * the consolidated totals with the prior-period comparison (AC1/AC2), and can
 * export to CSV ("Excel") or a printable PDF (AC3). Reads the admin-gated
 * `/admin/pnl-report` API (accountant / admin / super_admin / treasury).
 *
 * Direct costs (COGS) are GRN-based for the retail shop; with no product
 * cost-price recorded yet they show as 0.00 (AC1, documented limitation). Shared
 * overhead is shown unallocated and deducted once from the consolidated net.
 */
export default function PnlReportPage() {
  const [anchor, setAnchor] = useState<string>(() => defaultPnlAnchor());
  const [granularity, setGranularity] = useState<PnlGranularity>("month");
  const [report, setReport] = useState<PnlComparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(a: string, g: PnlGranularity) {
    setError(null);
    fetchPnlReport({ anchor: a, granularity: g })
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load the P&L"));
  }

  useEffect(() => {
    load(anchor, granularity);
  }, []);

  const query = { anchor, granularity };
  const cur = report?.current ?? null;
  const prevNet = new Map((report?.previous.byUnit ?? []).map((u) => [u.unit, u.netCents]));
  const netDelta = new Map((report?.deltaByUnit ?? []).map((u) => [u.unit, u.netDeltaCents]));

  const fmt = (cents: number) => `KES ${centsToKes(cents)}`;
  const labelFor = (u: PnlUnit) => pnlUnitLabel(u);

  return (
    <main>
      <h1>Consolidated P&amp;L</h1>
      <p>Per-unit revenue, direct costs, expenses and net — with last-period comparison.</p>

      <form
        aria-label="Period"
        onSubmit={(e) => {
          e.preventDefault();
          load(anchor, granularity);
        }}
      >
        <label>
          Anchor date
          <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
        </label>
        <label>
          Period
          <select
            value={granularity}
            onChange={(e) => {
              const g = e.target.value;
              if (isValidPnlGranularity(g)) setGranularity(g);
            }}
          >
            <option value="month">Month vs last month</option>
            <option value="year">Year vs last year</option>
          </select>
        </label>
        <button type="submit">Apply</button>
        <a href={pnlCsvHref(query)} download>
          Export Excel (CSV)
        </a>
        <a href={pnlPdfHref(query)} download>
          Export PDF
        </a>
      </form>

      {error && <p role="alert">{error}</p>}

      {report && cur && (
        <>
          <p>
            {cur.from} &ndash; {cur.to} (vs {report.previous.from} &ndash; {report.previous.to})
          </p>
          <section aria-label="P&L by unit">
            <table>
              <thead>
                <tr>
                  <th scope="col">Unit</th>
                  <th scope="col">Revenue</th>
                  <th scope="col">Direct costs</th>
                  <th scope="col">Expenses</th>
                  <th scope="col">Net</th>
                  <th scope="col">Prior net</th>
                  <th scope="col">Net change</th>
                </tr>
              </thead>
              <tbody>
                {cur.byUnit.map((u) => (
                  <tr key={u.unit}>
                    <td>{labelFor(u.unit)}</td>
                    <td>{fmt(u.revenueCents)}</td>
                    <td>{fmt(u.directCostsCents)}</td>
                    <td>{fmt(u.expensesCents)}</td>
                    <td>{fmt(u.netCents)}</td>
                    <td>{fmt(prevNet.get(u.unit) ?? 0)}</td>
                    <td>{fmt(netDelta.get(u.unit) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Subtotal</th>
                  <td>{fmt(cur.totals.revenueCents)}</td>
                  <td>{fmt(cur.totals.directCostsCents)}</td>
                  <td>{fmt(cur.totals.expensesCents)}</td>
                  <td>{fmt(cur.byUnit.reduce((a, u) => a + u.netCents, 0))}</td>
                  <td />
                  <td />
                </tr>
                <tr>
                  <th scope="row">Shared overhead (unallocated)</th>
                  <td />
                  <td />
                  <td>{fmt(cur.totals.sharedOverheadCents)}</td>
                  <td>-{centsToKes(cur.totals.sharedOverheadCents)}</td>
                  <td />
                  <td />
                </tr>
                <tr>
                  <th scope="row">Consolidated net</th>
                  <td />
                  <td />
                  <td />
                  <td>
                    <strong>{fmt(cur.totals.netCents)}</strong>
                  </td>
                  <td>{fmt(report.previous.totals.netCents)}</td>
                  <td>{fmt(report.totalsDelta.netDeltaCents)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
          <p>
            Direct costs (COGS) are GRN-based for the retail shop; with no product cost-price recorded
            yet they show as KES 0.00.
          </p>
        </>
      )}

      {!report && !error && <p>Loading…</p>}
    </main>
  );
}
