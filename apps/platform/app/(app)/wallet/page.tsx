"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WalletOverview } from "@bm/contracts";
import { TOP_UP_METHODS, walletTransactionRows } from "../../../lib/wallet";
import { fetchWalletOverview } from "../../../lib/wallet-api";
import { downloadStatement } from "../../../lib/statement-api";
import { WalletBalanceCard } from "../../components/WalletBalanceCard";

/** Last 12 months ending today — the default window for the full statement (AC3). */
function defaultStatementWindow(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Trigger a browser download of CSV text without leaving the page. */
function saveCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Parent dashboard wallet page (P1-E11-S01). Mobile-first. Shows the wallet hero
 * (balance + outstanding + read-only auto-credit + read-only loyalty, AC1), a
 * "Top up" CTA that opens the method picker (M-Pesa / card / bank, AC2), the
 * last 10 transactions with a "View full statement" CSV download (AC3), all read
 * from the epic-3/11 endpoints.
 */
export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [statementBusy, setStatementBusy] = useState(false);
  const [statementMsg, setStatementMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchWalletOverview()
      .then(setWallet)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load wallet"))
      .finally(() => setLoading(false));
  }, []);

  async function onViewFullStatement() {
    setStatementBusy(true);
    setStatementMsg(null);
    try {
      const result = await downloadStatement(defaultStatementWindow());
      if (result.kind === "csv") {
        saveCsv(result.csv, result.filename);
      } else {
        setStatementMsg("Your statement is being prepared; we'll text you the link.");
      }
    } catch (e) {
      setStatementMsg(e instanceof Error ? e.message : "Could not download statement");
    } finally {
      setStatementBusy(false);
    }
  }

  if (loading) return <main>Loading…</main>;
  if (error || !wallet) return <main role="alert">{error ?? "Wallet unavailable"}</main>;

  const rows = walletTransactionRows(wallet.recentTransactions);

  return (
    <main>
      <h1>Wallet</h1>

      <WalletBalanceCard wallet={wallet} />

      <button type="button" onClick={() => setShowPicker((v) => !v)} aria-expanded={showPicker}>
        Top up
      </button>

      {showPicker && (
        <section aria-label="Choose a top-up method">
          <h2>How would you like to top up?</h2>
          <ul>
            {TOP_UP_METHODS.map((m) => (
              <li key={m.key}>
                <Link href={m.href}>
                  <strong>{m.label}</strong>
                </Link>
                <span> — {m.description}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Recent transactions">
        <h2>Recent activity</h2>
        {rows.length === 0 ? (
          <p>No transactions yet.</p>
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.id}>
                <span>{r.dateLabel}</span> <span>{r.kind}</span>{" "}
                <span>{r.amountLabel}</span> <small>balance {r.balanceAfterLabel}</small>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={onViewFullStatement} disabled={statementBusy}>
          {statementBusy ? "Preparing…" : "View full statement"}
        </button>
        {statementMsg && <p role="status">{statementMsg}</p>}
      </section>
    </main>
  );
}
