"use client";

import { useCallback, useEffect, useState } from "react";
import type { WcSyncHealth } from "@bm/contracts";

/**
 * Admin WooCommerce sync surface (Story 29.7 / P4-E04-S07). Shows the sync-health
 * panel (last pull, queue depth, dead-letter count, last 10 errors) with a RED
 * BANNER when the last pull is > 15 min ago (AC5), a "Sync now" button that
 * triggers an immediate pull (admin-only, AC7), and the dead-letter list with
 * replay / mark-resolved / discard actions (AC4). All endpoints are server-gated
 * by `manage config`; a 403 renders a forbidden notice.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

type DeadLetter = {
  id: string;
  idempotencyKey: string;
  kind: string;
  attempts: number;
  lastError: string | null;
  deadLetteredAt: string;
};

function csrfToken(): string | undefined {
  return document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("bm_csrf="))
    ?.slice("bm_csrf=".length);
}

export const dynamic = "force-dynamic";

export default function WooCommerceSyncPage() {
  const [health, setHealth] = useState<WcSyncHealth | null>(null);
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [hRes, dRes] = await Promise.all([
        fetch(`${API_BASE}/admin/woocommerce-sync/health`, { credentials: "include" }),
        fetch(`${API_BASE}/admin/woocommerce-sync/dead-letters`, { credentials: "include" }),
      ]);
      if (hRes.status === 403 || dRes.status === 403) {
        throw new Error("You do not have permission to view WooCommerce sync.");
      }
      if (!hRes.ok || !dRes.ok) throw new Error("Failed to load sync status");
      setHealth((await hRes.json()) as WcSyncHealth);
      setDeadLetters(((await dRes.json()) as { deadLetters: DeadLetter[] }).deadLetters);
      setError(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (url: string, key: string) => {
      setBusy(key);
      try {
        const csrf = csrfToken();
        const res = await fetch(`${API_BASE}${url}`, {
          method: "POST",
          credentials: "include",
          headers: csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {},
        });
        if (!res.ok) throw new Error(`Action failed (${res.status})`);
        await load();
      } catch (e) {
        setError(String((e as Error).message ?? e));
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  return (
    <main style={{ padding: 24 }}>
      <h1>WooCommerce sync</h1>
      {error ? <p role="alert">{error}</p> : null}

      {health?.stale ? (
        <p role="alert" data-test="stale-banner" style={{ background: "#b00020", color: "white", padding: 12 }}>
          WooCommerce sync is stale — the last successful pull was more than 15 minutes ago.
        </p>
      ) : null}

      {health ? (
        <section aria-label="Sync health">
          <h2>Health</h2>
          <dl>
            <dt>Last successful pull</dt>
            <dd data-test="last-pull">
              {health.lastPullAt ? new Date(health.lastPullAt).toLocaleString() : "never"}
            </dd>
            <dt>Queue depth</dt>
            <dd data-test="queue-depth">{health.queueDepth}</dd>
            <dt>Dead-letter count</dt>
            <dd data-test="dead-letter-count">{health.deadLetterCount}</dd>
          </dl>
          <button type="button" disabled={busy === "sync-now"} onClick={() => void post("/admin/woocommerce-sync/sync-now", "sync-now")}>
            {busy === "sync-now" ? "Syncing…" : "Sync now"}
          </button>

          <h3>Recent errors</h3>
          {health.recentErrors.length === 0 ? (
            <p>No recent errors.</p>
          ) : (
            <ul>
              {health.recentErrors.map((e, i) => (
                <li key={i}>
                  <code>{e.source}</code> — {e.error} <small>({new Date(e.at).toLocaleString()})</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-label="Dead-letter queue">
        <h2>Dead-letter queue</h2>
        {deadLetters.length === 0 ? (
          <p>No dead-lettered writebacks.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Kind</th>
                <th>Attempts</th>
                <th>Last error</th>
                <th>Dead-lettered</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {deadLetters.map((d) => (
                <tr key={d.id}>
                  <td>{d.idempotencyKey}</td>
                  <td>{d.kind}</td>
                  <td>{d.attempts}</td>
                  <td>{d.lastError}</td>
                  <td>{new Date(d.deadLetteredAt).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      disabled={busy === `replay:${d.id}`}
                      onClick={() => void post(`/admin/woocommerce-sync/dead-letters/${d.id}/replay`, `replay:${d.id}`)}
                    >
                      Replay
                    </button>
                    <button
                      type="button"
                      disabled={busy === `resolve:${d.id}`}
                      onClick={() => void post(`/admin/woocommerce-sync/dead-letters/${d.id}/resolve`, `resolve:${d.id}`)}
                    >
                      Mark resolved
                    </button>
                    <button
                      type="button"
                      disabled={busy === `discard:${d.id}`}
                      onClick={() => void post(`/admin/woocommerce-sync/dead-letters/${d.id}/discard`, `discard:${d.id}`)}
                    >
                      Discard
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
