"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ParentSearchResponse, ParentSearchResult } from "@bm/contracts";
import {
  SEARCH_DEBOUNCE_MS,
  shouldSearch,
  formatCentsKes,
  formatPhoneLast4,
  formatLastVisit,
  debounce,
} from "../../lib/parent-search";

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
export default function ReceptionSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ParentSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ParentSearchResult | null>(null);
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
        </section>
      )}
    </main>
  );
}
