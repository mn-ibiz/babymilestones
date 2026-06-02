"use client";

import React, { useEffect, useState } from "react";
import { SERVICE_UNITS, serviceUnitLabel } from "@bm/contracts";
import {
  fetchPeakHoursHeatmap,
  heatmapTiles,
  defaultHeatmapRange,
  isValidHeatmapRange,
  type PeakHoursHeatmap,
  type HeatmapRange,
} from "../../../lib/peak-hours-heatmap";

/**
 * Peak-hours heatmap (P3-E05-S05 / Story 27.5). The admin picks an inclusive date
 * range (AC3 — capped at 12 months) and, optionally, a single unit (AC2), and sees
 * a 7×24 weekday×hour grid whose cell shade tracks the count of active sessions
 * (check-ins) in that bucket (AC1). Weekday rows are Sun→Sat; hours are 0→23, all
 * UTC (consistent with the rest of reporting). Reads the admin-gated
 * `/admin/peak-hours-heatmap` API (admin / super_admin / treasury).
 */
export default function PeakHoursHeatmapPage() {
  const [range, setRange] = useState<HeatmapRange>(() => defaultHeatmapRange());
  const [report, setReport] = useState<PeakHoursHeatmap | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(r: HeatmapRange) {
    setError(null);
    fetchPeakHoursHeatmap(r)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load the heatmap"));
  }

  useEffect(() => {
    load(range);
  }, []);

  const vm = report ? heatmapTiles(report) : null;
  const valid = isValidHeatmapRange(range);
  // Hour-of-day column headers (0..23).
  const hours = Array.from({ length: 24 }, (_unused, h) => h);

  // First-paint scaffold: the labelled weekday rows render before the fetch
  // resolves so the grid is present immediately (AC1).
  const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <main>
      <h1>Peak hours</h1>
      <p>When the complex is busiest — active sessions by weekday and hour (UTC).</p>
      <p>
        <a href="/operations">&larr; Back to today at a glance</a>
      </p>

      <form
        aria-label="Heatmap filters"
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
        <label>
          Unit
          <select
            value={range.unit}
            onChange={(e) => setRange((r) => ({ ...r, unit: e.target.value }))}
          >
            <option value="">All units</option>
            {SERVICE_UNITS.map((u) => (
              <option key={u} value={u}>
                {serviceUnitLabel(u)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={!valid}>
          Apply
        </button>
      </form>

      {!valid && <p role="alert">Pick a start date on or before the end date, within 12 months.</p>}
      {error && <p role="alert">{error}</p>}

      <section aria-label="Peak hours summary">
        <p>
          Total sessions: <strong>{vm ? vm.totalSessions.toLocaleString("en-KE") : "—"}</strong>
        </p>
        {vm?.peakLabel && (
          <p>
            Busiest: <strong>{vm.peakLabel}</strong>
          </p>
        )}
      </section>

      <section aria-label="Peak hours heatmap">
        <table>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {hours.map((h) => (
                <th key={h} scope="col">
                  {String(h).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(vm ? vm.rows : WEEKDAY_LABELS.map((label, weekday) => ({ weekday, label, cells: hours.map((hour) => ({ hour, count: 0, intensity: 0 })) }))).map((row) => (
              <tr key={row.weekday}>
                <th scope="row">{row.label}</th>
                {row.cells.map((cell) => (
                  <td
                    key={cell.hour}
                    title={`${row.label} ${String(cell.hour).padStart(2, "0")}:00 — ${cell.count} session(s)`}
                    aria-label={`${row.label} ${String(cell.hour).padStart(2, "0")}:00, ${cell.count} sessions`}
                    style={{
                      textAlign: "center",
                      // Shade by intensity (0..4): empty stays transparent.
                      background: cell.intensity > 0 ? `rgba(0, 96, 192, ${cell.intensity / 4})` : "transparent",
                    }}
                  >
                    {cell.count > 0 ? cell.count : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {!vm && !error && <p>Loading…</p>}
    </main>
  );
}
