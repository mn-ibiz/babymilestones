import { apiFetch } from "./api";
import type {
  ExpenseDto,
  ExpenseRecurringTemplateDto,
  ExpensesByUnitDto,
  ExpenseBusinessUnit,
} from "@bm/contracts";

/**
 * Admin/accountant Expenses client logic (P6-E05-S05 / Story 35.5). The `/expenses`
 * admin page reads the `manage expense`-gated `/admin/expenses` + `/admin/expense-templates`
 * API (credentialed — session cookie + CSRF) to list a period's expenses, create
 * one, list/create recurring templates, and read the per-unit P&L aggregate.
 * Framework-free so it unit-tests without React.
 */

export type Expense = ExpenseDto;
export type ExpenseTemplate = ExpenseRecurringTemplateDto;
export type ExpensesByUnit = ExpensesByUnitDto;

/** A row in the unit-picker. `null` = shared overhead. */
export interface ExpenseUnitOption {
  value: ExpenseBusinessUnit | "";
  label: string;
}

/** The unit options for the create form: the known units + a "shared overhead". */
export const EXPENSE_UNIT_OPTIONS: readonly ExpenseUnitOption[] = [
  { value: "", label: "Shared overhead (no unit)" },
  { value: "play", label: "Play" },
  { value: "talent", label: "Talent" },
  { value: "salon", label: "Salon" },
  { value: "coaching", label: "Coaching" },
  { value: "event", label: "Event" },
  { value: "shop", label: "Shop" },
];

/** Load the expenses for a half-open [fromDate, toDate) period, optionally by unit. */
export function fetchExpenses(query: {
  fromDate: string;
  toDate: string;
  unit?: ExpenseBusinessUnit;
}): Promise<{ expenses: Expense[] }> {
  const params = new URLSearchParams({ fromDate: query.fromDate, toDate: query.toDate });
  if (query.unit) params.set("unit", query.unit);
  return apiFetch<{ expenses: Expense[] }>(`/admin/expenses?${params.toString()}`);
}

/** Load the per-unit P&L aggregate for a period (AC4). */
export function fetchExpensesByUnit(query: {
  fromDate: string;
  toDate: string;
}): Promise<ExpensesByUnit> {
  const params = new URLSearchParams({ fromDate: query.fromDate, toDate: query.toDate });
  return apiFetch<ExpensesByUnit>(`/admin/expenses/by-unit?${params.toString()}`);
}

/** Create a one-off expense (AC1/AC2). */
export function createExpense(input: {
  expenseDate: string;
  category: string;
  businessUnit: ExpenseBusinessUnit | null;
  amountCents: number;
  paymentMethod: string;
  reference?: string | null;
  receiptAttachmentUrl?: string | null;
}): Promise<{ expense: Expense }> {
  return apiFetch<{ expense: Expense }>("/admin/expenses", { method: "POST", body: input });
}

/** List recurring expense templates (AC3). */
export function fetchTemplates(): Promise<{ templates: ExpenseTemplate[] }> {
  return apiFetch<{ templates: ExpenseTemplate[] }>("/admin/expense-templates");
}

/** Create a recurring expense template (AC3). */
export function createTemplate(input: {
  category: string;
  businessUnit: ExpenseBusinessUnit | null;
  amountCents: number;
  paymentMethod: string;
  dayOfMonth: number;
  reference?: string | null;
}): Promise<{ template: ExpenseTemplate }> {
  return apiFetch<{ template: ExpenseTemplate }>("/admin/expense-templates", { method: "POST", body: input });
}

/** Deactivate (soft-delete) a recurring template (AC2/AC3). */
export function deactivateTemplate(id: string): Promise<{ template: { id: string; deactivated: boolean } }> {
  return apiFetch<{ template: { id: string; deactivated: boolean } }>(`/admin/expense-templates/${id}`, {
    method: "DELETE",
  });
}

/** Format integer cents as KES, e.g. 150000 → "1,500.00". Pure + display-only. */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A render-ready expense row. */
export interface ExpenseRowView {
  id: string;
  date: string;
  category: string;
  unit: string;
  amount: string;
  paymentMethod: string;
  reference: string;
  recurring: boolean;
}

/** Human unit label for a unit code, or the shared-overhead label for null. */
export function unitLabel(unit: ExpenseBusinessUnit | null): string {
  if (unit === null) return "Shared overhead";
  const opt = EXPENSE_UNIT_OPTIONS.find((o) => o.value === unit);
  return opt?.label ?? unit;
}

/** Shape a list of expense DTOs into render-ready rows (pure). */
export function expenseRows(list: readonly Expense[]): ExpenseRowView[] {
  return list.map((e) => ({
    id: e.id,
    date: e.expenseDate,
    category: e.category,
    unit: unitLabel(e.businessUnit),
    amount: formatCents(e.amountCents),
    paymentMethod: e.paymentMethod,
    reference: e.reference ?? "",
    recurring: e.recurringTemplateId !== null,
  }));
}

/** A render-ready recurring-template row. */
export interface ExpenseTemplateRowView {
  id: string;
  category: string;
  unit: string;
  amount: string;
  dayOfMonth: number;
  active: boolean;
  lastRunMonth: string;
}

/** Shape recurring-template DTOs into render-ready rows (pure). */
export function templateRows(list: readonly ExpenseTemplate[]): ExpenseTemplateRowView[] {
  return list.map((t) => ({
    id: t.id,
    category: t.category,
    unit: unitLabel(t.businessUnit),
    amount: formatCents(t.amountCents),
    dayOfMonth: t.dayOfMonth,
    active: t.active,
    lastRunMonth: t.lastRunMonth ?? "—",
  }));
}
