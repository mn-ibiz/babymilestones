"use client";

import React, { useEffect, useState } from "react";
import {
  fetchCohortRetention,
  cohortGrid,
  defaultCohortRange,
  isValidCohortRange,
  type CohortRetention,
  type CohortRange,
} from "../../../lib/cohort-retention";

/**
 * Cohort retention by signup month (Story 35.2). The owner sees how well each signup-
 * month cohort sticks around: a triangular matrix where rows are signup months,
 * columns are months-since-signup (0,1,2,…), and each cell is the % of that cohort
 * still ACTIVE — at least one paid touchpoint (a wallet debit, by default) — in that
 * offset month (AC1/AC2). The current partial month is not over-counted: a cohort's
 * row stops at its last fully-observable offset, rendering blanks beyond. Reads the
 * gated `/admin/cohort-retention` API (admin / super_admin / treasury).
 */
export default function CohortRetentionPage() {
  const [range, setRange] = useState<CohortRange>(() => defaultCohortRange());
  const [report, setReport] = useState<CohortRetention | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(r: CohortRange) {
    setError(null);
    fetchCohortRetention(r)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load the cohort report"));
  }

  useEffect(() => {
    load(range);
    // Load once on mount with the default range.
  }, []);

  const vm = report ? cohortGrid(report) : null;
  const valid = isValidCohortRange(range);

  return (
    <main>
      <h1>Cohort retention</h1>
      <p>How well each signup-month cohort sticks around — % still active by months since signup.</p>
      <p>
        <a href="/operations">&larr; Back to today at a glance</a>
      </p>

      <form
        aria-label="Signup-month range"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) load(range);
        }}
      >
        <label>
          From
          <input
            type="month"
            value={range.fromMonth}
            onChange={(e) => setRange((r) => ({ ...r, fromMonth: e.target.value }))}
          />
        </label>
        <label>
          To
          <input
            type="month"
            value={range.toMonth}
            onChange={(e) => setRange((r) => ({ ...r, toMonth: e.target.value }))}
          />
        </label>
        <button type="submit" disabled={!valid}>
          Apply
        </button>
      </form>

      {!valid && <p role="alert">Pick a valid signup-month range (from on or before to).</p>}
      {error && <p role="alert">{error}</p>}

      <section aria-label="Cohort retention matrix">
        {vm === null ? (
          <p>Loading…</p>
        ) : vm.rows.length === 0 ? (
          <p>No signups in the selected range.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Signup month</th>
                <th scope="col">Cohort size</th>
                {vm.offsetHeaders.map((offset) => (
                  <th key={offset} scope="col">
                    Months since signup {offset}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vm.rows.map((row) => (
                <tr key={row.signupMonth}>
                  <th scope="row">{row.signupMonth}</th>
                  <td>{row.cohortSize}</td>
                  {row.cells.map((cell) => (
                    <td key={cell.offset} aria-label={cell.present ? undefined : "not yet observable"}>
                      {cell.value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
