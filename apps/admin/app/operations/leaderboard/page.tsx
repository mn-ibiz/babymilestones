"use client";

import React, { useEffect, useState } from "react";
import {
  fetchStaffLeaderboard,
  leaderboardRows,
  roleOptions,
  defaultLeaderboardRange,
  isValidLeaderboardRange,
  type StaffLeaderboard,
  type LeaderboardFilter,
} from "../../../lib/staff-leaderboard";

/**
 * Top-staff leaderboard (P3-E05-S03 / Story 27.3). The admin picks an inclusive
 * date range (AC1) and, optionally, a single attribution role (AC2), and sees a
 * per-staff table of total revenue, count of services, and average ticket, ranked
 * by revenue. Each row clicks through to the per-staff commission drill-down (AC3).
 * Reads the admin-gated `/admin/staff-leaderboard` API (admin / super_admin /
 * treasury — the same allow-list as the rest of Epic 27).
 */
export default function LeaderboardPage() {
  const [filter, setFilter] = useState<LeaderboardFilter>(() => ({
    ...defaultLeaderboardRange(),
    role: "",
  }));
  const [report, setReport] = useState<StaffLeaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(f: LeaderboardFilter) {
    setError(null);
    fetchStaffLeaderboard(f)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load leaderboard"));
  }

  useEffect(() => {
    load(filter);
  }, []);

  const rows = report ? leaderboardRows(report) : [];
  const valid = isValidLeaderboardRange(filter);

  return (
    <main>
      <h1>Top staff</h1>
      <p>
        <a href="/operations">&larr; Back to today at a glance</a>
      </p>

      <form
        aria-label="Filters"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) load(filter);
        }}
      >
        <label>
          From
          <input
            type="date"
            value={filter.fromDate}
            onChange={(e) => setFilter((f) => ({ ...f, fromDate: e.target.value }))}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={filter.toDate}
            onChange={(e) => setFilter((f) => ({ ...f, toDate: e.target.value }))}
          />
        </label>
        <label>
          Role
          <select
            value={filter.role}
            onChange={(e) =>
              setFilter((f) => ({ ...f, role: e.target.value as LeaderboardFilter["role"] }))
            }
          >
            {roleOptions().map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={!valid}>
          Apply
        </button>
      </form>

      {!valid && <p role="alert">Pick a start date on or before the end date.</p>}
      {error && <p role="alert">{error}</p>}

      <table>
        <thead>
          <tr>
            <th scope="col">Staff</th>
            <th scope="col">Role</th>
            <th scope="col">Revenue</th>
            <th scope="col">Services</th>
            <th scope="col">Avg ticket</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.staffId}>
              <td>
                <a href={r.href}>{r.staffName}</a>
              </td>
              <td>{r.roleLabel}</td>
              <td>{r.revenue}</td>
              <td>{r.serviceCount}</td>
              <td>{r.avgTicket}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {report && rows.length === 0 && <p>No staff for this period.</p>}
      {!report && !error && <p>Loading…</p>}
    </main>
  );
}
