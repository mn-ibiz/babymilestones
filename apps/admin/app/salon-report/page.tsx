"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  fetchSalonReport,
  salonReportStylists,
  salonReportTile,
  type SalonDayReport,
} from "../../lib/salon-report";

/**
 * Salon-specific reporting tile + drill-down (P3-E03-S05 / Story 25.5).
 *
 * The admin "salon at a glance" surface: a tile showing TODAY's salon bookings,
 * no-shows, and total revenue (AC1), with a per-stylist drill-down below it (AC2).
 * Admin-gated server-side (the `/admin/salon-report` API enforces `read report` —
 * admin / accountant / treasury / super_admin); this page reads it credentialed.
 *
 * Forward-compatible with the operational dashboard (P3-E05 / Epic 27, not yet
 * built): the tile + drill-down are self-contained here today, and the tile
 * shaping lives in `@bm/contracts` so Epic 27 can drop the same tile into the
 * dashboard grid by reusing `fetchSalonReport` + `salonReportTile`.
 */
export default function SalonReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [report, setReport] = useState<SalonDayReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setError(null);
    try {
      setReport(await fetchSalonReport(d));
    } catch (e: unknown) {
      setReport(null);
      setError(e instanceof Error ? e.message : "Could not load the salon report");
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  const tile = report ? salonReportTile(report) : null;
  const stylists = report ? salonReportStylists(report) : [];

  return (
    <main>
      <h1>Salon today</h1>
      <p>Today&rsquo;s salon bookings, no-shows, and revenue, with a per-stylist breakdown.</p>

      <label>
        Date
        <input
          type="date"
          aria-label="Report date"
          value={date}
          onChange={(e) => setDate(e.target.value || today)}
        />
      </label>

      {error && <p role="alert">{error}</p>}

      {/* AC1: the at-a-glance tile. Labels render on first paint so the tile is
          present before the fetch resolves; values fill in once it loads. */}
      <section aria-label="Salon at a glance">
        <dl>
          <div>
            <dt>Bookings</dt>
            <dd>{tile ? tile.stats[0]!.value : "—"}</dd>
          </div>
          <div>
            <dt>No-shows</dt>
            <dd>{tile ? tile.stats[1]!.value : "—"}</dd>
          </div>
          <div>
            <dt>Revenue</dt>
            <dd>{tile ? tile.stats[2]!.value : "—"}</dd>
          </div>
        </dl>
        {tile?.isEmpty && <p>No salon bookings for this day.</p>}
      </section>

      {/* AC2: per-stylist drill-down. */}
      <section aria-label="By stylist">
        <h2>By stylist</h2>
        {report === null ? (
          <p>Loading…</p>
        ) : stylists.length === 0 ? (
          <p>No stylist activity for this day.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Stylist</th>
                <th scope="col">Bookings</th>
                <th scope="col">No-shows</th>
                <th scope="col">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {stylists.map((s) => (
                <tr key={s.staffId}>
                  <td>{s.staffName}</td>
                  <td>{s.bookings}</td>
                  <td>{s.noShows}</td>
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
