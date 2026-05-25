"use client";

import { useMemo, useState } from "react";
import {
  canExport,
  exportFilename,
  exportUrl,
  rangeSummary,
  validateExportRange,
  type ExportRangeValues,
} from "../../../../lib/reconciliation-export";

/**
 * Reconciliation CSV export for the accountant (P1-E06-S04). A date-range picker
 * (AC1) and an "Export CSV" button that downloads the per-day-per-float-account
 * reconciliation (date, account, system balance, real balance, drift,
 * adjustments made that day — AC2). The server re-validates the range, re-checks
 * the treasury/accountant grant, and audits the export.
 */
const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;

export default function ReconciliationExportPage() {
  const [values, setValues] = useState<ExportRangeValues>({ fromDate: monthStart, toDate: today });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validationError = useMemo(() => validateExportRange(values), [values]);
  const ready = canExport(values);

  const update = (patch: Partial<ExportRangeValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setError(null);
  };

  const onExport = async () => {
    if (!ready) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(exportUrl(values), { credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Export failed (${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = exportFilename(values);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      setError("Export failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 560 }}>
      <h1>Export float reconciliation</h1>
      <p>
        Download the daily liability-vs-float reconciliation as a CSV to reconcile in Excel. One row
        per day per float account: date, account, system balance, real balance, drift, and the
        adjustments made that day.
      </p>

      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
        <label>
          <span>From</span>
          <input
            type="date"
            value={values.fromDate}
            onChange={(e) => update({ fromDate: e.target.value })}
            aria-label="From date"
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="date"
            value={values.toDate}
            onChange={(e) => update({ toDate: e.target.value })}
            aria-label="To date"
          />
        </label>
        <button type="button" onClick={onExport} disabled={!ready || busy}>
          {busy ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {ready ? <p>{rangeSummary(values)}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
