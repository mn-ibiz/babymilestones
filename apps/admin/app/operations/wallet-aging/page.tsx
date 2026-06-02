"use client";

import React, { useEffect, useState } from "react";
import {
  fetchWalletAging,
  walletAgingTiles,
  walletAgingExportHref,
  isValidWalletAgingFilter,
  type WalletAgingReport,
  type WalletAgingFilter,
} from "../../../lib/wallet-aging";

/**
 * Wallet aging report (P3-E05-S04 / Story 27.4). The accountant sees how long
 * outstanding balances have been open: every parent's open balance sorted into
 * aging buckets — 0–7 / 8–30 / 31–60 / 61–90 / 90+ days (AC1) — with a per-parent
 * row under each bucket that clicks through to that parent's profile/statement
 * (AC2), and a CSV export using the same as-of filter (AC3). Reads the gated
 * `/admin/wallet-aging` API (accountant / admin / super_admin / treasury).
 */
export default function WalletAgingPage() {
  const [filter, setFilter] = useState<WalletAgingFilter>({});
  const [report, setReport] = useState<WalletAgingReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(f: WalletAgingFilter) {
    setError(null);
    fetchWalletAging(f)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load aging report"));
  }

  useEffect(() => {
    load(filter);
  }, []);

  const vm = report ? walletAgingTiles(report) : null;
  const valid = isValidWalletAgingFilter(filter);

  return (
    <main>
      <h1>Wallet aging</h1>
      <p>How long outstanding balances have been open, bucketed by age.</p>
      <p>
        <a href="/operations">&larr; Back to today at a glance</a>
      </p>

      <form
        aria-label="As-of date"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) load(filter);
        }}
      >
        <label>
          As of
          <input
            type="date"
            value={filter.asOf ?? ""}
            onChange={(e) => setFilter({ asOf: e.target.value || undefined })}
          />
        </label>
        <button type="submit" disabled={!valid}>
          Apply
        </button>
        {valid && (
          <a href={walletAgingExportHref(filter)} download>
            Export CSV
          </a>
        )}
      </form>

      {!valid && <p role="alert">Pick a valid as-of date.</p>}
      {error && <p role="alert">{error}</p>}

      {vm && (
        <>
          <p>
            <strong>Total outstanding: {vm.total}</strong>
          </p>
          {vm.buckets.map((bucket) => (
            <section key={bucket.key} aria-label={`Bucket ${bucket.label}`}>
              <h2>
                {bucket.label} — {bucket.total}
              </h2>
              {bucket.rows.length === 0 ? (
                <p>No outstanding balances in this bucket.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Parent</th>
                      <th scope="col">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucket.rows.map((row) => (
                      <tr key={row.parentId}>
                        <td>
                          <a href={row.href}>{row.parentName}</a>
                        </td>
                        <td>{row.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
        </>
      )}

      {!vm && !error && <p>Loading…</p>}
    </main>
  );
}
