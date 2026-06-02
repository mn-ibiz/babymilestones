"use client";

import { useCallback, useEffect, useState } from "react";
import type { SkuMappingRow, StockReconciliationReport } from "@bm/contracts";
import {
  parseWooProductIdEntry,
  importSummaryLabel,
  reconciliationSummaryLabel,
} from "../../lib/sku-mapping";

/**
 * Admin SKU-mapping + stock-reconciliation surface (Story 29.5 / P4-E04-S05),
 * under the catalogue. Lists each local product with its `woo_product_id` for
 * manual entry (AC5), supports a bulk CSV import (AC5), and surfaces the newest
 * nightly reconciliation drift report (AC6). All endpoints are server-gated by
 * `manage config`; a 403 renders a forbidden notice.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

function csrfToken(): string | undefined {
  return document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("bm_csrf="))
    ?.slice("bm_csrf=".length);
}

export const dynamic = "force-dynamic";

export default function WooCommerceStockPage() {
  const [mappings, setMappings] = useState<SkuMappingRow[]>([]);
  const [report, setReport] = useState<StockReconciliationReport | null>(null);
  const [csv, setCsv] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mRes, rRes] = await Promise.all([
        fetch(`${API_BASE}/admin/woocommerce-stock/sku-mappings`, { credentials: "include" }),
        fetch(`${API_BASE}/admin/woocommerce-stock/reconciliation`, { credentials: "include" }),
      ]);
      if (mRes.status === 403 || rRes.status === 403) {
        throw new Error("You do not have permission to manage SKU mappings.");
      }
      if (!mRes.ok || !rRes.ok) throw new Error("Failed to load SKU mappings");
      setMappings(((await mRes.json()) as { mappings: SkuMappingRow[] }).mappings);
      setReport(((await rRes.json()) as { report: StockReconciliationReport | null }).report);
      setError(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveMapping = useCallback(
    async (productId: string, raw: string) => {
      const parsed = parseWooProductIdEntry(raw);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      setBusy(`map:${productId}`);
      try {
        const csrf = csrfToken();
        const res = await fetch(`${API_BASE}/admin/woocommerce-stock/sku-mappings/${productId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
          },
          body: JSON.stringify({ wooProductId: parsed.value }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        await load();
      } catch (e) {
        setError(String((e as Error).message ?? e));
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const runImport = useCallback(async () => {
    setBusy("import");
    setImportMsg(null);
    try {
      const csrf = csrfToken();
      const res = await fetch(`${API_BASE}/admin/woocommerce-stock/sku-mappings/import`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
        },
        body: JSON.stringify({ csv }),
      });
      if (!res.ok) throw new Error(`Import failed (${res.status})`);
      const result = (await res.json()) as { applied: number; errors: { line: number; message: string }[] };
      setImportMsg(importSummaryLabel(result));
      await load();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  }, [csv, load]);

  return (
    <main style={{ padding: 24 }}>
      <h1>Catalogue — WooCommerce SKU mapping</h1>
      {error ? <p role="alert">{error}</p> : null}

      <section aria-label="Reconciliation">
        <h2>Stock reconciliation</h2>
        <p data-test="reconciliation-summary">{reconciliationSummaryLabel(report)}</p>
        {report && report.drift.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Local</th>
                <th>Woo</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {report.drift.map((d) => (
                <tr key={d.productId}>
                  <td>{d.sku}</td>
                  <td>{d.name}</td>
                  <td>{d.localStock}</td>
                  <td>{d.wooStock ?? "—"}</td>
                  <td>{d.delta > 0 ? `+${d.delta}` : d.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <section aria-label="Bulk import">
        <h2>Bulk CSV import</h2>
        <p>Header: <code>sku,woo_product_id</code> — a blank id clears the mapping.</p>
        <textarea
          aria-label="SKU mapping CSV"
          rows={6}
          cols={48}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <div>
          <button type="button" disabled={busy === "import" || csv.trim() === ""} onClick={() => void runImport()}>
            {busy === "import" ? "Importing…" : "Import CSV"}
          </button>
        </div>
        {importMsg ? <p data-test="import-summary">{importMsg}</p> : null}
      </section>

      <section aria-label="SKU mappings">
        <h2>Products</h2>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Local stock</th>
              <th>Woo product id</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <MappingRow key={m.productId} row={m} busy={busy === `map:${m.productId}`} onSave={saveMapping} />
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function MappingRow(props: {
  row: SkuMappingRow;
  busy: boolean;
  onSave: (productId: string, raw: string) => void;
}) {
  const { row, busy, onSave } = props;
  const [value, setValue] = useState(row.wooProductId === null ? "" : String(row.wooProductId));
  return (
    <tr>
      <td>{row.sku}</td>
      <td>{row.name}</td>
      <td>{row.stockQty}</td>
      <td>
        <input
          aria-label={`Woo product id for ${row.sku}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="(in-store only)"
        />
      </td>
      <td>
        <button type="button" disabled={busy} onClick={() => onSave(row.productId, value)}>
          {busy ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
}
