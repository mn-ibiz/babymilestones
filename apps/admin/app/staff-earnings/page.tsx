"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  fetchStaffEarnings,
  fetchStaffOptions,
  formatEarningsCents,
  formatPayoutDate,
  formatVisitCount,
  topByCountRows,
  topByRevenueRows,
  type StaffEarnings,
  type StaffOption,
} from "../../lib/staff-earnings";

/**
 * PUBLIC staff-earnings viewer (P3-E02-S01). Deliberately OUTSIDE the SSO/role
 * gate (exempted in `middleware.ts`) so a stylist can check earnings from the
 * reception PC without logging in (AC1). The dropdown lists active staff by
 * display name only (AC2); picking one shows month-to-date, last month, and the
 * last payout (AC3). Below the total it also shows the earnings breakdown
 * (P3-E02-S02 AC1): completed-visit count and the top 3 services by count and by
 * revenue, scoped to the same month-to-date window. It reads only the public
 * `/public/staff-earnings` API, which exposes the display name + numbers + service
 * NAMES — no parent/child/booking PII (S01 AC4 / S02 AC2) — and is rate-limited +
 * 60s-cached server-side (AC5 / Dev Notes).
 */
export default function StaffEarningsPage() {
  const [options, setOptions] = useState<StaffOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [earnings, setEarnings] = useState<StaffEarnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStaffOptions()
      .then(setOptions)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load staff"));
  }, []);

  const onSelect = useCallback(async (id: string) => {
    setSelectedId(id);
    setError(null);
    setEarnings(null);
    if (!id) return;
    try {
      setEarnings(await fetchStaffEarnings(id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load earnings");
    }
  }, []);

  return (
    <main>
      <h1>Staff earnings</h1>
      <p>Pick your name to see this month&rsquo;s earnings. No login needed.</p>

      <label>
        Staff member
        <select
          aria-label="Staff member"
          value={selectedId}
          onChange={(e) => void onSelect(e.target.value)}
        >
          <option value="">Choose a name…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.displayName}
            </option>
          ))}
        </select>
      </label>

      {error && <p role="alert">{error}</p>}

      {earnings && (
        <section aria-label="Earnings">
          <h2>{earnings.displayName}</h2>
          <dl>
            <dt>This month so far</dt>
            <dd>{formatEarningsCents(earnings.monthToDateCents)}</dd>
            <dt>Last month</dt>
            <dd>{formatEarningsCents(earnings.lastMonthCents)}</dd>
            <dt>Last payout</dt>
            <dd>
              {formatEarningsCents(earnings.lastPayoutCents)}
              {earnings.lastPayoutAt ? ` on ${formatPayoutDate(earnings.lastPayoutAt)}` : ""}
            </dd>
          </dl>

          {/* Earnings breakdown (P3-E02-S02 AC1) — below the total. Service names
              + counts/revenue only; no customer-specific information (AC2). */}
          <section aria-label="This month's breakdown">
            <h3>This month&rsquo;s breakdown</h3>
            <p>
              Completed visits: <strong>{formatVisitCount(earnings.completedVisits)}</strong>
            </p>

            <h4>Top services by visits</h4>
            {earnings.topServicesByCount.length === 0 ? (
              <p>No visits yet this month.</p>
            ) : (
              <ol aria-label="Top services by visits">
                {topByCountRows(earnings).map((r) => (
                  <li key={`count-${r.serviceName}`}>
                    {r.serviceName} — {r.detail}
                  </li>
                ))}
              </ol>
            )}

            <h4>Top services by revenue</h4>
            {earnings.topServicesByRevenue.length === 0 ? (
              <p>No revenue yet this month.</p>
            ) : (
              <ol aria-label="Top services by revenue">
                {topByRevenueRows(earnings).map((r) => (
                  <li key={`rev-${r.serviceName}`}>
                    {r.serviceName} — {r.detail}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </section>
      )}
    </main>
  );
}
