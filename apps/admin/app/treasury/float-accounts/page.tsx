"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FloatAccountKind } from "@bm/contracts";
import {
  FLOAT_KIND_OPTIONS,
  canSubmitFloatAccount,
  floatKindLabel,
  kesToCents,
  validateFloatAccount,
  type FloatAccountFormValues,
} from "../../../lib/float-accounts-form";

/**
 * Treasury float-account CRUD (P1-E06-S01 AC2). Admin/treasury declares the
 * accounts that hold customer wallet float. The server re-validates and enforces
 * the admin/treasury grant; this page drives the list + create form.
 */
interface FloatAccount {
  id: string;
  name: string;
  kind: FloatAccountKind;
  openingBalance: number;
  openingDate: string;
  active: boolean;
}

const EMPTY: FloatAccountFormValues = {
  name: "",
  kind: "",
  openingBalanceKes: 0,
  openingDate: new Date().toISOString().slice(0, 10),
};

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

export default function FloatAccountsPage() {
  const [accounts, setAccounts] = useState<FloatAccount[]>([]);
  const [values, setValues] = useState<FloatAccountFormValues>(EMPTY);
  const validation = useMemo(() => validateFloatAccount(values), [values]);

  const load = useCallback(async () => {
    const res = await fetch("/treasury/float-accounts", { credentials: "include" });
    if (res.ok) setAccounts(((await res.json()) as { accounts: FloatAccount[] }).accounts);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmitFloatAccount(validation) || values.kind === "") return;
      const res = await fetch("/treasury/float-accounts", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify({
          name: values.name.trim(),
          kind: values.kind,
          openingBalance: kesToCents(values.openingBalanceKes),
          openingDate: values.openingDate,
        }),
      });
      if (res.ok) {
        setValues(EMPTY);
        await load();
      }
    },
    [validation, values, load],
  );

  const onDeactivate = useCallback(
    async (id: string) => {
      const res = await fetch(`/treasury/float-accounts/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "x-csrf-token": readCsrfToken() },
      });
      if (res.ok) await load();
    },
    [load],
  );

  return (
    <main>
      <h1>Float accounts</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Kind</th>
            <th>Opening (KES)</th>
            <th>Opening date</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>{floatKindLabel(a.kind)}</td>
              <td>{(a.openingBalance / 100).toFixed(2)}</td>
              <td>{a.openingDate}</td>
              <td>{a.active ? "Active" : "Inactive"}</td>
              <td>
                {a.active && (
                  <button type="button" onClick={() => onDeactivate(a.id)}>
                    Deactivate
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Add a float account</h2>
      <form onSubmit={onSubmit}>
        <label>
          Name
          <input
            name="name"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            aria-invalid={Boolean(validation.errors.name)}
            required
          />
        </label>
        <label>
          Kind
          <select
            name="kind"
            value={values.kind}
            onChange={(e) => setValues((v) => ({ ...v, kind: e.target.value as FloatAccountKind }))}
            aria-invalid={Boolean(validation.errors.kind)}
            required
          >
            <option value="">Choose…</option>
            {FLOAT_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Opening balance (KES)
          <input
            name="openingBalanceKes"
            type="number"
            value={values.openingBalanceKes}
            onChange={(e) =>
              setValues((v) => ({ ...v, openingBalanceKes: Number(e.target.value) }))
            }
            aria-invalid={Boolean(validation.errors.openingBalanceKes)}
          />
        </label>
        <label>
          Opening date
          <input
            name="openingDate"
            type="date"
            value={values.openingDate}
            onChange={(e) => setValues((v) => ({ ...v, openingDate: e.target.value }))}
            aria-invalid={Boolean(validation.errors.openingDate)}
            required
          />
        </label>
        <button type="submit" disabled={!canSubmitFloatAccount(validation)}>
          Create float account
        </button>
      </form>
    </main>
  );
}
