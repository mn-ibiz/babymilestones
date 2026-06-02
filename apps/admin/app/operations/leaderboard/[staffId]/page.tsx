"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchStaffCommission,
  commissionView,
  defaultLeaderboardRange,
  type StaffCommissionDrilldown,
} from "../../../../lib/staff-leaderboard";

/**
 * Per-staff commission drill-down (P3-E05-S03 / Story 27.3 AC3). The leaderboard
 * row clicks through here with the SAME date range; this page reads the admin-
 * gated `/admin/staff-leaderboard/:staffId/commission` API and shows that staff
 * member's commission totals for the period — REUSING the commission ledger as
 * the single source of truth (the server nets accruals minus reversals). Read-only
 * (admin / super_admin / treasury).
 */
export default function StaffCommissionPage({ params }: { params: { staffId: string } }) {
  const search = useSearchParams();
  const fallback = defaultLeaderboardRange();
  const fromDate = search.get("fromDate") ?? fallback.fromDate;
  const toDate = search.get("toDate") ?? fallback.toDate;

  const [drill, setDrill] = useState<StaffCommissionDrilldown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStaffCommission(params.staffId, { fromDate, toDate })
      .then(setDrill)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load commission"),
      );
  }, [params.staffId, fromDate, toDate]);

  const backHref = `/operations/leaderboard?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`;
  const view = drill ? commissionView(drill) : null;

  return (
    <main>
      <h1>{view ? `Commission — ${view.staffName}` : "Commission"}</h1>
      <p>
        <a href={backHref}>&larr; Back to the leaderboard</a>
      </p>

      {error && <p role="alert">{error}</p>}

      {view && (
        <section aria-label="Commission totals">
          <p>
            {view.roleLabel} · {view.from} to {view.to}
          </p>
          <table>
            <tbody>
              <tr>
                <th scope="row">Net commission</th>
                <td>{view.netCommission}</td>
              </tr>
              <tr>
                <th scope="row">Accrued</th>
                <td>{view.accruedCommission}</td>
              </tr>
              <tr>
                <th scope="row">Reversed</th>
                <td>{view.reversedCommission}</td>
              </tr>
              <tr>
                <th scope="row">Ledger entries</th>
                <td>{view.entryCount.toLocaleString("en-KE")}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {!view && !error && <p>Loading…</p>}
    </main>
  );
}
