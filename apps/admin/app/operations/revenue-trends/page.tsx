"use client";

import React, { useEffect, useState } from "react";
import {
  fetchRevenueByPeriod,
  revenueTiles,
  revenueExportHref,
  defaultRevenueRange,
  isValidRange,
  type RevenueByPeriod,
  type RevenueRange,
} from "../../../lib/revenue-by-period";

/**
 * Revenue by unit, by period (P3-E05-S02 / Story 27.2). The owner picks an
 * inclusive date range (AC1), sees the per-unit NET revenue series (chart-ready,
 * here a bar list) plus the period-over-period delta against the immediately-
 * preceding equal-length period, and can export the SAME filter to CSV (AC2).
 * Refunds are already excluded server-side (NET revenue, AC3). Reads the admin-
 * gated `/admin/revenue-by-period` API (admin / super_admin / treasury).
 */
export default function RevenueTrendsPage() {
  const [range, setRange] = useState<RevenueRange>(() => defaultRevenueRange());
  const [report, setReport] = useState<RevenueByPeriod | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(r: RevenueRange) {
    setError(null);
    fetchRevenueByPeriod(r)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load revenue"));
  }

  useEffect(() => {
    load(range);
  }, []);

  const vm = report ? revenueTiles(report) : null;
  const valid = isValidRange(range);
  // Max bar width reference for the simple inline chart.
  const maxCents = vm ? Math.max(1, ...vm.series.map((s) => Math.abs(s.revenueCents))) : 1;

  const deltaGlyph = (dir: "up" | "down" | "flat") => (dir === "up" ? "▲" : dir === "down" ? "▼" : "—");

  return (
    <main>
      <h1>Revenue by unit</h1>
      <p>
        <a href="/operations">&larr; Back to today at a glance</a>
      </p>

      <form
        aria-label="Date range"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) load(range);
        }}
      >
        <label>
          From
          <input
            type="date"
            value={range.fromDate}
            onChange={(e) => setRange((r) => ({ ...r, fromDate: e.target.value }))}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={range.toDate}
            onChange={(e) => setRange((r) => ({ ...r, toDate: e.target.value }))}
          />
        </label>
        <button type="submit" disabled={!valid}>
          Apply
        </button>
        {valid && (
          <a href={revenueExportHref(range)} download>
            Export CSV
          </a>
        )}
      </form>

      {!valid && <p role="alert">Pick a start date on or before the end date.</p>}
      {error && <p role="alert">{error}</p>}

      {vm && (
        <>
          <section aria-label="Total revenue">
            <h2>Total (net of refunds)</h2>
            <p>
              <strong>{vm.total.value}</strong>{" "}
              <span aria-label={`change ${vm.total.deltaDirection}`}>
                {deltaGlyph(vm.total.deltaDirection)} {vm.total.deltaValue}
              </span>{" "}
              <span>vs previous period ({vm.total.previousValue})</span>
            </p>
          </section>

          <section aria-label="Revenue by unit chart">
            <h2>By unit</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">Unit</th>
                  <th scope="col">Revenue</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <tbody>
                {vm.series.map((s) => (
                  <tr key={s.unit}>
                    <td>{s.label}</td>
                    <td>
                      <span
                        role="img"
                        aria-hidden="true"
                        style={{
                          display: "inline-block",
                          width: `${Math.round((Math.abs(s.revenueCents) / maxCents) * 100)}%`,
                          minWidth: s.revenueCents > 0 ? "2px" : 0,
                          height: "0.75em",
                          background: "currentColor",
                          marginRight: "0.5em",
                          verticalAlign: "middle",
                        }}
                      />
                      {s.value}
                    </td>
                    <td>
                      <span aria-label={`change ${s.deltaDirection}`}>
                        {deltaGlyph(s.deltaDirection)} {s.deltaValue}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {!vm && !error && <p>Loading…</p>}
    </main>
  );
}
