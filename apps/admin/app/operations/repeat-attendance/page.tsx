"use client";

import React, { useEffect, useState } from "react";
import {
  fetchRepeatAttendance,
  repeatAttendanceTable,
  defaultRepeatAttendanceRange,
  isValidRepeatAttendanceRange,
  type RepeatAttendanceReport,
  type RepeatAttendanceRange,
} from "../../../lib/repeat-attendance";

/**
 * Repeat-attendance metrics for events and classes (P6-E06-S03 / Story 35.3). The
 * admin picks an inclusive date range (AC2) and sees a per-class table (AC1): total
 * attendees, the % who attended ANOTHER class in the window (repeat rate), and the
 * average distinct classes attended per attendee — plus an overall summary. A "class"
 * is an event (door-checked-in ticket) or a class-type booking (`talent`/`coaching`
 * with an attendance check-in). Reads the admin-gated `/admin/repeat-attendance` API
 * (admin / super_admin / treasury).
 */
export default function RepeatAttendancePage() {
  const [range, setRange] = useState<RepeatAttendanceRange>(() => defaultRepeatAttendanceRange());
  const [report, setReport] = useState<RepeatAttendanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(r: RepeatAttendanceRange) {
    setError(null);
    fetchRepeatAttendance(r)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load repeat attendance"));
  }

  useEffect(() => {
    load(range);
  }, []);

  const vm = report ? repeatAttendanceTable(report) : null;
  const valid = isValidRepeatAttendanceRange(range);

  return (
    <main>
      <h1>Repeat attendance</h1>
      <p>How many people come back — repeat rate and average classes attended, per class and event.</p>
      <p>
        <a href="/operations">&larr; Back to today at a glance</a>
      </p>

      <form
        aria-label="Repeat attendance filters"
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
      </form>

      {!valid && <p role="alert">Pick a start date on or before the end date.</p>}
      {error && <p role="alert">{error}</p>}

      <section aria-label="Repeat attendance summary">
        <p>
          Total classes &amp; events: <strong>{vm ? vm.summary.totalClasses.toLocaleString("en-KE") : "—"}</strong>
        </p>
        <p>
          Distinct attendees: <strong>{vm ? vm.summary.totalAttendees.toLocaleString("en-KE") : "—"}</strong>
        </p>
        <p>
          Overall repeat rate: <strong>{vm ? vm.summary.repeatAttendeePctLabel : "—"}</strong>
        </p>
        <p>
          Avg classes per attendee: <strong>{vm ? vm.summary.avgClassesAttendedLabel : "—"}</strong>
        </p>
      </section>

      <section aria-label="Repeat attendance by class">
        <table>
          <thead>
            <tr>
              <th scope="col">Class</th>
              <th scope="col">Attendees</th>
              <th scope="col">Repeat rate</th>
              <th scope="col">Avg classes</th>
            </tr>
          </thead>
          <tbody>
            {(vm?.rows ?? []).map((row) => (
              <tr key={row.classId}>
                <th scope="row">{row.label}</th>
                <td>{row.totalAttendees.toLocaleString("en-KE")}</td>
                <td>{row.repeatAttendeePctLabel}</td>
                <td>{row.avgClassesAttendedLabel}</td>
              </tr>
            ))}
            {vm && vm.rows.length === 0 && (
              <tr>
                <td colSpan={4}>No classes or events in this range.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {!vm && !error && <p>Loading…</p>}
    </main>
  );
}
