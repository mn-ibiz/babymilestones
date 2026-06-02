"use client";

import React, { useEffect, useState } from "react";
import { centsToKes } from "@bm/contracts";
import {
  fetchTaxReport,
  taxCsvHref,
  taxPdfHref,
  defaultTaxRange,
  type TaxReport,
} from "../../lib/tax-report";

/**
 * Tax-ready exports by period (P6-E07-S06 / Story 35.6). The accountant/owner picks
 * an inclusive date range and sees the per-period TAXABLE SUPPLIES, VAT CHARGED and
 * EXEMPT SUPPLIES (+ total + a per-month breakdown) for settled, non-voided receipts
 * (AC1), and can export to CSV ("Excel") or a printable PDF (AC2). Reads the
 * admin-gated `/admin/tax-report` API (accountant / admin / super_admin / treasury).
 */
export default function TaxReportPage() {
  const initial = defaultTaxRange();
  const [fromDate, setFromDate] = useState<string>(initial.fromDate);
  const [toDate, setToDate] = useState<string>(initial.toDate);
  const [report, setReport] = useState<TaxReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(from: string, to: string) {
    setError(null);
    fetchTaxReport({ fromDate: from, toDate: to })
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load the tax report"));
  }

  useEffect(() => {
    load(fromDate, toDate);
  }, []);

  const range = { fromDate, toDate };
  const fmt = (cents: number) => `KES ${centsToKes(cents)}`;

  return (
    <main>
      <h1>Tax-ready summary</h1>
      <p>Per-period taxable supplies, VAT charged and exempt supplies — from settled receipts.</p>

      <form
        aria-label="Period"
        onSubmit={(e) => {
          e.preventDefault();
          load(fromDate, toDate);
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
        <a href={taxCsvHref(range)} download>
          Export Excel (CSV)
        </a>
        <a href={taxPdfHref(range)} download>
          Export PDF
        </a>
      </form>

      {error && <p role="alert">{error}</p>}

      <section aria-label="Tax summary">
        <table>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Taxable supplies</th>
              <th scope="col">VAT charged</th>
              <th scope="col">Exempt supplies</th>
              <th scope="col">Total supplies</th>
            </tr>
          </thead>
          <tbody>
            {(report?.byMonth ?? []).map((m) => (
              <tr key={m.month}>
                <td>{m.month}</td>
                <td>{fmt(m.taxableSuppliesCents)}</td>
                <td>{fmt(m.vatChargedCents)}</td>
                <td>{fmt(m.exemptSuppliesCents)}</td>
                <td>{fmt(m.totalSuppliesCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{fmt(report?.taxableSuppliesCents ?? 0)}</td>
              <td>{fmt(report?.vatChargedCents ?? 0)}</td>
              <td>{fmt(report?.exemptSuppliesCents ?? 0)}</td>
              <td>
                <strong>{fmt(report?.totalSuppliesCents ?? 0)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {report && (
        <p>
          {report.fromDate} &ndash; {report.toDate}. Figures are net of VAT from settled (non-voided)
          receipts; taxable supplies are vatable (standard-rated) lines and exempt supplies include
          VAT-exempt and zero-rated lines.
        </p>
      )}

      {!report && !error && <p>Loading…</p>}
    </main>
  );
}
