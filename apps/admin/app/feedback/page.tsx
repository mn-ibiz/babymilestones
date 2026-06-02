"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchFeedbackDashboard,
  fetchFeedbackResponses,
  feedbackUnitView,
  feedbackStaffView,
  feedbackDistributionView,
  feedbackResponsesView,
  type FeedbackDashboard,
  type FeedbackResponse,
} from "../../lib/feedback-dashboard";

/**
 * Feedback dashboard by unit + by staff (P6-E04-S02 / Story 34.2).
 *
 * One screen showing satisfaction across every unit: a per-unit table (count,
 * average, 0–5 distribution) and a per-staff table whose average is suppressed
 * behind a low-sample badge until enough ratings accrue (AC1). Filterable by date
 * range (AC2). Clicking a unit/staff drills into the individual responses,
 * ANONYMISED by default; an admin can REVEAL the parent behind a rating, which the
 * API audits (AC3). Admin-gated server-side; this page reads it credentialed.
 */
function defaultRange(): { fromDate: string; toDate: string } {
  // Default to the trailing 30 days ending today (UTC).
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const from = new Date(today.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  return { fromDate: from, toDate: to };
}

export default function FeedbackDashboardPage() {
  const initial = useMemo(defaultRange, []);
  const [fromDate, setFromDate] = useState(initial.fromDate);
  const [toDate, setToDate] = useState(initial.toDate);
  const [dashboard, setDashboard] = useState<FeedbackDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Drill-down state: the selected unit/staff + the fetched responses.
  const [drill, setDrill] = useState<{ unit?: string; staffId?: string; label: string } | null>(null);
  const [responses, setResponses] = useState<FeedbackResponse[] | null>(null);
  const [revealed, setRevealed] = useState(false);

  const refresh = useCallback(() => {
    setError(null);
    fetchFeedbackDashboard({ fromDate, toDate })
      .then(setDashboard)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load feedback"));
  }, [fromDate, toDate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadResponses = useCallback(
    (sel: { unit?: string; staffId?: string; label: string }, reveal: boolean) => {
      setDrill(sel);
      setRevealed(reveal);
      setError(null);
      fetchFeedbackResponses({ fromDate, toDate, unit: sel.unit, staffId: sel.staffId, reveal })
        .then((r) => setResponses(r.responses))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load responses"));
    },
    [fromDate, toDate],
  );

  const unitRows = dashboard ? feedbackUnitView(dashboard) : [];
  const staffRows = dashboard ? feedbackStaffView(dashboard) : [];
  const responseRows = responses ? feedbackResponsesView(responses) : [];

  return (
    <main>
      <h1>Feedback</h1>
      <p>Ratings by unit and by staff. Staff averages stay hidden until enough ratings accrue.</p>

      {/* AC2: date-range filter. */}
      <form
        aria-label="Date range"
        onSubmit={(e) => {
          e.preventDefault();
          refresh();
        }}
      >
        <label>
          From
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <button type="submit">Apply</button>
      </form>

      {error && <p role="alert">{error}</p>}

      {/* AC1: by-unit table — count, average, distribution; drill to responses. */}
      <section aria-label="By unit">
        <h2>By unit</h2>
        {unitRows.length === 0 ? (
          <p>No feedback in this range.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Unit</th>
                <th scope="col">Responses</th>
                <th scope="col">Average</th>
                <th scope="col">Distribution (0–5)</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {unitRows.map((u) => (
                <tr key={u.unit}>
                  <td>{u.label}</td>
                  <td>{u.count}</td>
                  <td>{u.average}</td>
                  <td>
                    {feedbackDistributionView(u.distribution)
                      .map((b) => `${b.rating}★:${b.count}`)
                      .join("  ")}
                  </td>
                  <td>
                    <button type="button" onClick={() => loadResponses({ unit: u.unit, label: u.label }, false)}>
                      View responses
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* AC1: by-staff table — average suppressed behind a low-sample badge. */}
      <section aria-label="By staff">
        <h2>By staff</h2>
        {staffRows.length === 0 ? (
          <p>No attributed feedback in this range.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Staff</th>
                <th scope="col">Average</th>
                <th scope="col">Ratings</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {staffRows.map((s) => (
                <tr key={s.staffId}>
                  <td>{s.staffName}</td>
                  <td>
                    {s.average}
                    {s.lowSample && <span> (too few to show)</span>}
                  </td>
                  <td>{s.sampleBadge}</td>
                  <td>
                    <button type="button" onClick={() => loadResponses({ staffId: s.staffId, label: s.staffName }, false)}>
                      View responses
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* AC3: individual responses — anonymised by default; admin reveal control. */}
      {drill && (
        <section aria-label="Individual responses">
          <h2>Responses — {drill.label}</h2>
          <p>
            {revealed ? (
              <span>Showing parent identities (this reveal is recorded).</span>
            ) : (
              <button type="button" onClick={() => loadResponses(drill, true)}>
                Reveal parent identities
              </button>
            )}
          </p>
          {responseRows.length === 0 ? (
            <p>No responses.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Staff</th>
                  <th scope="col">Rating</th>
                  <th scope="col">Comment</th>
                  {revealed && <th scope="col">Parent</th>}
                </tr>
              </thead>
              <tbody>
                {responseRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{r.unitLabel}</td>
                    <td>{r.staffName}</td>
                    <td>{r.rating}</td>
                    <td>{r.comment}</td>
                    {revealed && <td>{r.parentName ?? "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}
