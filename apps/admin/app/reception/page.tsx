"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ParentSearchResponse,
  ParentSearchResult,
  ReceptionTopupMethod,
  ReceptionTopupResponse,
  RecentTransactionsResponse,
} from "@bm/contracts";
import {
  recentTransactionsViewModel,
  fullStatementHref,
} from "../../lib/recent-transactions";
import {
  SEARCH_DEBOUNCE_MS,
  shouldSearch,
  formatCentsKes,
  formatPhoneLast4,
  formatLastVisit,
  debounce,
} from "../../lib/parent-search";
import {
  TOPUP_METHOD_OPTIONS,
  canSubmitTopup,
  isLivePolling,
  kesToCents,
  stkStatusUrl,
  topupStatusLabel,
  validateTopup,
} from "../../lib/topup-form";

/**
 * Reception parent-search surface (P1-E05-S01).
 *
 * AC1: the search input is auto-focused on load; it accepts phone (any format)
 *      or a partial name.
 * AC2: queries are debounced 200ms; the server returns shaped results fast
 *      (≤300ms p95 against 10k parents — proven in the API test).
 * AC3: each result row shows name, phone last-4, wallet balance, outstanding,
 *      and last visit date.
 * AC4: clicking a result opens the parent profile in the SAME page (client-side
 *      state swap — no full reload).
 */
/**
 * Reception top-up sheet (P1-E05-S03). Amount field + method picker (AC1). On
 * submit it POSTs /api/reception/topup; cash returns settled and the receipt is
 * printed immediately (AC3), while M-Pesa STK returns pending and the sheet polls
 * the live status endpoint until the parent confirms on their phone (AC2). The
 * staff actor + wallet are derived server-side from the session + parentId.
 */
function TopUpSheet({ parentId, onClose }: { parentId: string; onClose: () => void }) {
  const [amountKes, setAmountKes] = useState("");
  const [method, setMethod] = useState<ReceptionTopupMethod | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ReceptionTopupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<string | null>(null);

  const amountNum = Number(amountKes);
  const validation = validateTopup({ amountKes: amountNum, method });

  // AC2: poll the STK status endpoint while an M-Pesa top-up is pending.
  useEffect(() => {
    if (!result || !isLivePolling(result) || !result.transactionId) return;
    let active = true;
    const id = setInterval(async () => {
      try {
        const res = await fetch(stkStatusUrl(result.transactionId!), { credentials: "include" });
        if (!res.ok || !active) return;
        const body = (await res.json()) as { state: string };
        setLiveState(body.state);
        if (body.state === "SUCCEEDED" || body.state === "FAILED" || body.state === "EXPIRED") {
          clearInterval(id);
        }
      } catch {
        /* transient — keep polling */
      }
    }, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [result]);

  const submit = useCallback(async () => {
    if (method === "" || !canSubmitTopup(validation)) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reception/topup", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId, method, amount: kesToCents(amountNum) }),
      });
      const body = (await res.json()) as ReceptionTopupResponse & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Top-up failed");
        return;
      }
      setResult(body);
    } catch {
      setError("Could not reach the server");
    } finally {
      setSubmitting(false);
    }
  }, [amountNum, method, parentId, validation]);

  return (
    <section aria-label="Top up" role="dialog">
      <h3>Top up</h3>
      {!result && (
        <>
          <label>
            Amount (KES)
            <input
              name="amount"
              inputMode="numeric"
              value={amountKes}
              onChange={(e) => setAmountKes(e.target.value)}
            />
          </label>
          {validation.errors.amountKes && <p role="alert">{validation.errors.amountKes}</p>}

          <fieldset>
            <legend>Method</legend>
            {TOPUP_METHOD_OPTIONS.map((o) => (
              <label key={o.value}>
                <input
                  type="radio"
                  name="method"
                  value={o.value}
                  checked={method === o.value}
                  onChange={() => setMethod(o.value)}
                />
                {o.label}
              </label>
            ))}
          </fieldset>
          {validation.errors.method && <p role="alert">{validation.errors.method}</p>}

          {error && <p role="alert">{error}</p>}

          <button
            type="button"
            disabled={!canSubmitTopup(validation) || submitting}
            onClick={submit}
          >
            {submitting ? "Processing…" : "Take payment"}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </>
      )}

      {result && (
        <div role="status">
          <p>{topupStatusLabel(result.method, result.status)}</p>
          {liveState && <p>Live status: {liveState}</p>}
          {result.authorizationUrl && (
            <a href={result.authorizationUrl} target="_blank" rel="noreferrer">
              Open card checkout
            </a>
          )}
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Recent-transactions panel (P1-E05-S05). Rendered below the parent header, it
 * fetches the latest 10 ledger postings for the parent and lists each with date,
 * kind, amount, and running balance-after (AC1), newest-first. A "View full
 * statement" link opens the P1-E03-S08 export rather than re-implementing it
 * (AC2). All display formatting lives in the pure `recent-transactions` lib.
 */
function RecentTransactionsPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<ReturnType<typeof recentTransactionsViewModel>>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    (async () => {
      try {
        const res = await fetch(`/api/reception/parents/${userId}/recent-transactions`, {
          credentials: "include",
        });
        if (!res.ok || !active) return;
        const body = (await res.json()) as RecentTransactionsResponse;
        if (active) setRows(recentTransactionsViewModel(body.transactions));
      } catch {
        if (active) setRows([]);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <section aria-label="Recent transactions">
      <h3>Recent transactions</h3>
      <a href={fullStatementHref(userId)}>View full statement</a>
      {loaded && rows.length === 0 && <p role="status">No transactions yet.</p>}
      {rows.length > 0 && (
        <ul aria-label="Recent transactions list">
          {rows.map((r) => (
            <li key={r.id}>
              <span>{r.dateLabel}</span>
              <span>{r.kind}</span>
              <span>{r.amountLabel}</span>
              <span>Balance {r.balanceAfterLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ReceptionSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ParentSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ParentSearchResult | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // AC1: auto-focus the search field on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // AC2: debounce the live search to one request per 200ms of quiet.
  const runSearch = useRef(
    debounce(async (q: string) => {
      if (!shouldSearch(q)) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/reception/parents/search?q=${encodeURIComponent(q)}`, {
          credentials: "include",
        });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const body = (await res.json()) as ParentSearchResponse;
        setResults(body.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS),
  ).current;

  const onQuery = useCallback(
    (q: string) => {
      setQuery(q);
      setSelected(null);
      runSearch(q);
    },
    [runSearch],
  );

  // AC4: client-side profile open — no navigation, no full reload.
  const onOpen = useCallback((result: ParentSearchResult) => {
    setSelected(result);
    setTopupOpen(false);
  }, []);

  return (
    <main>
      <h1>Find a parent</h1>
      <label>
        Search by phone or name
        <input
          ref={inputRef}
          name="q"
          value={query}
          autoFocus
          placeholder="Phone or name"
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>

      {loading && <p role="status">Searching…</p>}

      {!selected && (
        <ul aria-label="Search results">
          {results.map((r) => (
            <li key={r.userId}>
              <button type="button" onClick={() => onOpen(r)}>
                <span>
                  {r.firstName} {r.lastName}
                </span>
                <span>{formatPhoneLast4(r.phoneLast4)}</span>
                <span>Balance {formatCentsKes(r.walletBalanceCents)}</span>
                <span>Outstanding {formatCentsKes(r.outstandingCents)}</span>
                <span>Last visit {formatLastVisit(r.lastVisitAt)}</span>
              </button>
            </li>
          ))}
          {!loading && shouldSearch(query) && results.length === 0 && (
            <li role="status">No parents match “{query}”.</li>
          )}
        </ul>
      )}

      {selected && (
        <section aria-label="Parent profile">
          <button type="button" onClick={() => setSelected(null)}>
            ← Back to results
          </button>
          <h2>
            {selected.firstName} {selected.lastName}
          </h2>
          {/* AC1: "Top up" CTA opens the method-picker sheet. */}
          <button type="button" onClick={() => setTopupOpen(true)}>
            Top up
          </button>
          {topupOpen && (
            <TopUpSheet parentId={selected.userId} onClose={() => setTopupOpen(false)} />
          )}
          <dl>
            <dt>Phone</dt>
            <dd>{formatPhoneLast4(selected.phoneLast4)}</dd>
            <dt>Wallet balance</dt>
            <dd>{formatCentsKes(selected.walletBalanceCents)}</dd>
            <dt>Outstanding</dt>
            <dd>{formatCentsKes(selected.outstandingCents)}</dd>
            <dt>Last visit</dt>
            <dd>{formatLastVisit(selected.lastVisitAt)}</dd>
          </dl>
          {/* AC1/AC2: latest 10 ledger postings + "View full statement" link. */}
          <RecentTransactionsPanel userId={selected.userId} />
        </section>
      )}
    </main>
  );
}
