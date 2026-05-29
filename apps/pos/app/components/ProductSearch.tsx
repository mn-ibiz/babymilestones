"use client";

import { useEffect, useRef, useState } from "react";
import type { PosProduct } from "@bm/contracts";
import { formatKes, isOutOfStock, shouldSearch, stockLabel } from "../../lib/products";
import { lookupProductByCode, searchProducts } from "../../lib/products-api";

const DEBOUNCE_MS = 250;

/**
 * Product scan + search (P2-E04-S02). A barcode field is auto-focused so a
 * hardware scanner's "type + Enter" lands a SKU/barcode lookup straight into the
 * sale (AC1). A separate name field runs a debounced search showing price +
 * stock (AC2). Out-of-stock rows are greyed and cannot be added (AC3 — the hard
 * block at checkout follows in S03/S04). Adding a product calls `onAdd`.
 */
export function ProductSearch({ onAdd }: { onAdd: (product: PosProduct) => void }) {
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const scanningRef = useRef(false);

  // Auto-focus the scanner field on mount so a scan flows in without a tap (AC1).
  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  // Debounced name search (AC2): only fires once the query is long enough. The
  // `cancelled` flag drops a stale in-flight response so a slow earlier query
  // can never overwrite the results of a newer one (out-of-order race).
  useEffect(() => {
    if (!shouldSearch(query)) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void searchProducts(query).then((r) => {
        if (!cancelled) setResults(r);
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  function onCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCode(e.target.value);
    setFlash(null);
  }

  function onQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setFlash(null);
  }

  function add(product: PosProduct) {
    if (isOutOfStock(product)) return; // guarded again at checkout (S03/S04)
    onAdd(product);
    setFlash(`Added ${product.name}`);
  }

  async function onScan(e: React.FormEvent) {
    e.preventDefault();
    const term = code.trim();
    if (term === "" || scanningRef.current) return; // ignore concurrent scans
    scanningRef.current = true;
    try {
      const product = await lookupProductByCode(term);
      setCode("");
      scanRef.current?.focus();
      if (!product) {
        setFlash(`No product for “${term}”`);
        return;
      }
      if (isOutOfStock(product)) {
        setFlash(`${product.name} is out of stock`);
        return;
      }
      add(product);
    } finally {
      scanningRef.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={onScan} aria-label="Scan a product">
        <label className="flex flex-col gap-1 text-sm">
          Scan barcode / SKU
          <input
            ref={scanRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            value={code}
            onChange={onCodeChange}
            placeholder="Scan or type a code, then Enter"
            className="touch-target rounded-lg border border-ink/20 px-3"
          />
        </label>
      </form>

      <label className="flex flex-col gap-1 text-sm">
        Search by name
        <input
          type="search"
          value={query}
          onChange={onQueryChange}
          placeholder="e.g. nappies"
          className="touch-target rounded-lg border border-ink/20 px-3"
        />
      </label>

      {flash && (
        <p role="status" className="text-sm text-ink/70">
          {flash}
        </p>
      )}

      <ul aria-label="Search results" className="flex flex-col gap-1">
        {results.map((p) => {
          const out = isOutOfStock(p);
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-lg border border-ink/10 px-3 py-2 ${
                out ? "opacity-40" : ""
              }`}
              aria-disabled={out}
            >
              <span className="flex flex-col">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-ink/60">
                  {formatKes(p.priceCents)} · {stockLabel(p)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => add(p)}
                disabled={out}
                className="touch-target rounded-lg bg-brand px-4 text-sm font-medium text-surface disabled:opacity-50"
              >
                Add
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
