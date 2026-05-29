"use client";

import { useState } from "react";
import {
  validateRunRange,
  formatCents,
  type CommissionRunPreview,
} from "../../lib/commission-runs";

/**
 * Admin Reports → "Run ad-hoc commission" (P3-E01-S04). Date-range picker →
 * preview totals (AC1); confirming POSTs an ad_hoc run (AC2). The export +
 * mark-paid actions (S05) hang off the run history list.
 */
export function CommissionRunsClient() {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<CommissionRunPreview | null>(null);

  function onPreview(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateRunRange(periodStart, periodEnd);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    // POST /admin/commission-runs/preview → setPreview(...) in the integration layer.
  }

  return (
    <section>
      <h1>Run ad-hoc commission</h1>
      <form onSubmit={onPreview}>
        <input
          aria-label="Period start"
          type="datetime-local"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
        />
        {errors.periodStart && <p role="alert">{errors.periodStart}</p>}
        <input
          aria-label="Period end"
          type="datetime-local"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
        />
        {errors.periodEnd && <p role="alert">{errors.periodEnd}</p>}
        <button type="submit">Preview totals</button>
      </form>

      {preview && (
        <div>
          <p>Total: {formatCents(preview.totalCents)}</p>
          <ul>
            {preview.lines.map((l) => (
              <li key={l.staffId}>
                {l.staffNameSnapshot}: {formatCents(l.amountCents)}
              </li>
            ))}
          </ul>
          <button type="button">Confirm run</button>
        </div>
      )}
    </section>
  );
}
