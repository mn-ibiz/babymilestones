"use client";

import React, { useEffect, useState } from "react";
import {
  fetchFloatVsRevenue,
  floatVsRevenueTiles,
  type FloatVsRevenue,
} from "../../../lib/float-vs-revenue";

/**
 * Wallet float vs revenue snapshot (P5-E05-S04 / Story 35.4).
 *
 * The accountant's daily treasury view: how much CUSTOMER money is sitting in
 * wallets (the `customer_wallet_liability` we owe back) versus the segregated
 * (float/bank) balance that backs it, the prior-day change in that liability, and
 * the revenue earned that day (AC1) — plus a 90-day chart series of float vs
 * revenue (AC2). Reads the financial-reporting-gated `/admin/float-vs-revenue` API
 * (accountant / admin / super_admin / treasury) credentialed; read-only.
 */
export default function FloatVsRevenuePage() {
  const [report, setReport] = useState<FloatVsRevenue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetchFloatVsRevenue({})
      .then(setReport)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load the float-vs-revenue report"),
      );
  }, []);

  const vm = report ? floatVsRevenueTiles(report) : null;
  const deltaGlyph = (dir: "up" | "down" | "flat") => (dir === "up" ? "▲" : dir === "down" ? "▼" : "—");
  // Max reference for the simple inline bars (liability vs revenue).
  const maxCents = vm
    ? Math.max(
        1,
        ...vm.series.map((s) => Math.abs(s.walletLiabilityCents)),
        ...vm.series.map((s) => Math.abs(s.segregatedBalanceCents)),
      )
    : 1;

  return (
    <main>
      <h1>Wallet float vs revenue</h1>
      <p>
        Customer money sitting in wallets vs the segregated float backing it, and revenue earned each day.
      </p>
      <p>
        <a href="/operations">&larr; Back to today at a glance</a>
      </p>

      {error && <p role="alert">{error}</p>}

      {/* AC1 — the daily snapshot KPIs. */}
      <section aria-label="Daily snapshot">
        <h2>Daily snapshot{vm ? ` (${vm.snapshot.date})` : ""}</h2>
        <dl>
          <div>
            <dt>Customer wallet liability</dt>
            <dd>{vm ? vm.snapshot.walletLiability : "—"}</dd>
          </div>
          <div>
            <dt>Segregated balance</dt>
            <dd>{vm ? vm.snapshot.segregatedBalance : "—"}</dd>
          </div>
          <div>
            <dt>Prior-day change</dt>
            <dd>
              {vm ? (
                <span aria-label={`change ${vm.snapshot.priorDayDeltaDirection}`}>
                  {deltaGlyph(vm.snapshot.priorDayDeltaDirection)} {vm.snapshot.priorDayDelta}
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt>Revenue earned</dt>
            <dd>{vm ? vm.snapshot.revenue : "—"}</dd>
          </div>
        </dl>
      </section>

      {/* AC2 — the 90-day float-vs-revenue series. */}
      <section aria-label="Float vs revenue series">
        <h2>90-day float vs revenue</h2>
        {!vm ? (
          <p>{error ? "Unavailable." : "Loading…"}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Wallet liability</th>
                <th scope="col">Segregated balance</th>
                <th scope="col">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {vm.series.map((s) => (
                <tr key={s.date}>
                  <td>{s.date}</td>
                  <td>
                    <span
                      role="img"
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: `${Math.round((Math.abs(s.walletLiabilityCents) / maxCents) * 100)}%`,
                        minWidth: s.walletLiabilityCents > 0 ? "2px" : 0,
                        height: "0.75em",
                        background: "currentColor",
                        marginRight: "0.5em",
                        verticalAlign: "middle",
                      }}
                    />
                    {s.walletLiability}
                  </td>
                  <td>{s.segregatedBalance}</td>
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
