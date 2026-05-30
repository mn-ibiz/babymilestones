"use client";

import { useEffect, useState } from "react";
import type { LoyaltyAccountResponse } from "@bm/contracts";
import { fetchLoyaltyAccount } from "../../../lib/loyalty-api";
import { formatKes, formatPoints, toLoyaltyHistoryView } from "../../../lib/loyalty";

/**
 * Parent dashboard loyalty page (P2-E05-S04). Mobile-first. Shows the points
 * balance + lifetime earned/redeemed (AC1) and an earn/redeem history list with
 * friendly source labels (AC2), read from `GET /parents/me/loyalty`.
 */
export default function LoyaltyPage() {
  const [account, setAccount] = useState<LoyaltyAccountResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLoyaltyAccount()
      .then(setAccount)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load loyalty points"),
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main>Loading…</main>;
  if (error || !account) return <main role="alert">{error ?? "Loyalty unavailable"}</main>;

  const history = account.history.map(toLoyaltyHistoryView);

  return (
    <main>
      <h1>Loyalty points</h1>

      {/* AC1 — balance + lifetime earned/redeemed */}
      <section aria-label="Points balance">
        <p>Points balance</p>
        <p>
          <strong>{formatPoints(account.balance)}</strong>
        </p>
        <p>Worth {formatKes(account.quote.maxDiscountCents)} at checkout</p>
        <dl>
          <dt>Lifetime earned</dt>
          <dd>{formatPoints(account.lifetimeEarned)}</dd>
          <dt>Lifetime redeemed</dt>
          <dd>{formatPoints(account.lifetimeRedeemed)}</dd>
        </dl>
      </section>

      {/* AC2 — earn/redeem history with source labels */}
      <section aria-label="Points history">
        <h2>History</h2>
        {history.length === 0 ? (
          <p>No points activity yet.</p>
        ) : (
          <ul>
            {history.map((h) => (
              <li key={h.id}>
                <span>{h.label}</span> <small>{h.date}</small>{" "}
                <span>{h.points}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
