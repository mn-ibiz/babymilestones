"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  EXPENSE_UNIT_OPTIONS,
  fetchExpenses,
  fetchTemplates,
  createExpense,
  createTemplate,
  deactivateTemplate,
  expenseRows,
  templateRows,
  type Expense,
  type ExpenseTemplate,
} from "../../lib/expenses";
import type { ExpenseBusinessUnit } from "@bm/contracts";

/**
 * Expenses module (P6-E05-S05 / Story 35.5) — the FOUNDATION the consolidated P&L
 * (35.1) consumes. One screen where an admin/accountant records the money the
 * business SPENT: a CREATE form + a period-filtered LIST of expenses (AC1/AC2), and
 * the RECURRING templates that auto-materialise on their day (AC3). `manage
 * expense`-gated server-side; this page reads it credentialed.
 */

/** Default period = the current calendar month, as a half-open [from, to). */
function monthBounds(now = new Date()): { fromDate: string; toDate: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const next = new Date(Date.UTC(y, m + 1, 1));
  return { fromDate: start.toISOString().slice(0, 10), toDate: next.toISOString().slice(0, 10) };
}

const PAYMENT_METHODS = ["cash", "mpesa", "bank_transfer", "card"] as const;

export default function ExpensesPage() {
  const [{ fromDate, toDate }, setPeriod] = useState(monthBounds());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Create-expense form state.
  const [form, setForm] = useState({
    expenseDate: new Date().toISOString().slice(0, 10),
    category: "",
    businessUnit: "" as ExpenseBusinessUnit | "",
    amountKes: "",
    paymentMethod: "cash" as (typeof PAYMENT_METHODS)[number],
    reference: "",
    receiptAttachmentUrl: "",
  });

  // Create-template form state.
  const [tplForm, setTplForm] = useState({
    category: "",
    businessUnit: "" as ExpenseBusinessUnit | "",
    amountKes: "",
    paymentMethod: "bank_transfer" as (typeof PAYMENT_METHODS)[number],
    dayOfMonth: "1",
  });

  const refresh = useCallback(() => {
    setError(null);
    Promise.all([fetchExpenses({ fromDate, toDate }), fetchTemplates()])
      .then(([e, t]) => {
        setExpenses(e.expenses);
        setTemplates(t.templates);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load expenses"));
  }, [fromDate, toDate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = useCallback(
    (p: Promise<unknown>) => {
      setError(null);
      p.then(refresh).catch((e: unknown) => setError(e instanceof Error ? e.message : "Action failed"));
    },
    [refresh],
  );

  const submitExpense = (ev: React.FormEvent) => {
    ev.preventDefault();
    const amountCents = Math.round(Number(form.amountKes) * 100);
    run(
      createExpense({
        expenseDate: form.expenseDate,
        category: form.category,
        businessUnit: form.businessUnit === "" ? null : form.businessUnit,
        amountCents,
        paymentMethod: form.paymentMethod,
        reference: form.reference || null,
        receiptAttachmentUrl: form.receiptAttachmentUrl || null,
      }),
    );
  };

  const submitTemplate = (ev: React.FormEvent) => {
    ev.preventDefault();
    const amountCents = Math.round(Number(tplForm.amountKes) * 100);
    run(
      createTemplate({
        category: tplForm.category,
        businessUnit: tplForm.businessUnit === "" ? null : tplForm.businessUnit,
        amountCents,
        paymentMethod: tplForm.paymentMethod,
        dayOfMonth: Number(tplForm.dayOfMonth),
      }),
    );
  };

  const rows = expenseRows(expenses);
  const tplRows = templateRows(templates);

  return (
    <main>
      <h1>Expenses</h1>
      <p>
        Record what the business spends. Expenses subtract from each unit&rsquo;s revenue in the P&amp;L; leave the
        unit blank for shared overhead.
      </p>

      {error && <p role="alert">{error}</p>}

      {/* Period filter. */}
      <section aria-label="Period">
        <label>
          From{" "}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setPeriod((p) => ({ ...p, fromDate: e.target.value }))}
          />
        </label>{" "}
        <label>
          To{" "}
          <input type="date" value={toDate} onChange={(e) => setPeriod((p) => ({ ...p, toDate: e.target.value }))} />
        </label>
      </section>

      {/* AC1/AC2: create an expense. */}
      <section aria-label="Record an expense">
        <h2>Record an expense</h2>
        <form onSubmit={submitExpense}>
          <label>
            Date{" "}
            <input
              type="date"
              value={form.expenseDate}
              onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
              required
            />
          </label>
          <label>
            Category{" "}
            <input
              aria-label="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              required
            />
          </label>
          <label>
            Unit{" "}
            <select
              aria-label="Business unit"
              value={form.businessUnit}
              onChange={(e) => setForm((f) => ({ ...f, businessUnit: e.target.value as ExpenseBusinessUnit | "" }))}
            >
              {EXPENSE_UNIT_OPTIONS.map((o) => (
                <option key={o.value || "overhead"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount (KES){" "}
            <input
              aria-label="Amount"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amountKes}
              onChange={(e) => setForm((f) => ({ ...f, amountKes: e.target.value }))}
              required
            />
          </label>
          <label>
            Payment method{" "}
            <select
              aria-label="Payment method"
              value={form.paymentMethod}
              onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as (typeof PAYMENT_METHODS)[number] }))}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reference{" "}
            <input
              aria-label="Reference"
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
            />
          </label>
          <label>
            Receipt URL{" "}
            <input
              aria-label="Receipt URL"
              value={form.receiptAttachmentUrl}
              onChange={(e) => setForm((f) => ({ ...f, receiptAttachmentUrl: e.target.value }))}
            />
          </label>
          <button type="submit">Add expense</button>
        </form>
      </section>

      {/* AC1: the expenses list for the period. */}
      <section aria-label="Expenses">
        <h2>Expenses this period</h2>
        {rows.length === 0 ? (
          <p>No expenses in this period.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Category</th>
                <th scope="col">Unit</th>
                <th scope="col">Amount</th>
                <th scope="col">Paid via</th>
                <th scope="col">Reference</th>
                <th scope="col">Recurring</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.category}</td>
                  <td>{r.unit}</td>
                  <td>{r.amount}</td>
                  <td>{r.paymentMethod}</td>
                  <td>{r.reference}</td>
                  <td>{r.recurring ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* AC3: recurring expense templates. */}
      <section aria-label="Recurring expenses">
        <h2>Recurring expenses</h2>
        <form onSubmit={submitTemplate}>
          <label>
            Category{" "}
            <input
              aria-label="Template category"
              value={tplForm.category}
              onChange={(e) => setTplForm((f) => ({ ...f, category: e.target.value }))}
              required
            />
          </label>
          <label>
            Unit{" "}
            <select
              aria-label="Template business unit"
              value={tplForm.businessUnit}
              onChange={(e) => setTplForm((f) => ({ ...f, businessUnit: e.target.value as ExpenseBusinessUnit | "" }))}
            >
              {EXPENSE_UNIT_OPTIONS.map((o) => (
                <option key={o.value || "overhead"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount (KES){" "}
            <input
              aria-label="Template amount"
              type="number"
              min="0.01"
              step="0.01"
              value={tplForm.amountKes}
              onChange={(e) => setTplForm((f) => ({ ...f, amountKes: e.target.value }))}
              required
            />
          </label>
          <label>
            Day of month{" "}
            <input
              aria-label="Day of month"
              type="number"
              min="1"
              max="28"
              value={tplForm.dayOfMonth}
              onChange={(e) => setTplForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
              required
            />
          </label>
          <button type="submit">Add recurring expense</button>
        </form>

        {tplRows.length === 0 ? (
          <p>No recurring expenses configured.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Unit</th>
                <th scope="col">Amount</th>
                <th scope="col">Day</th>
                <th scope="col">Last run</th>
                <th scope="col">Status</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {tplRows.map((t) => (
                <tr key={t.id}>
                  <td>{t.category}</td>
                  <td>{t.unit}</td>
                  <td>{t.amount}</td>
                  <td>{t.dayOfMonth}</td>
                  <td>{t.lastRunMonth}</td>
                  <td>{t.active ? "Active" : "Inactive"}</td>
                  <td>
                    {t.active && (
                      <button type="button" onClick={() => run(deactivateTemplate(t.id))}>
                        Deactivate
                      </button>
                    )}
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
