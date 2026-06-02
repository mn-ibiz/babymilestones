import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import {
  expenses,
  expenseRecurringTemplates,
  type ExpenseRow,
  type ExpenseRecurringTemplateRow,
} from "@bm/db";
import type { Executor } from "./services.js";
import { SERVICE_UNITS } from "./services.js";

/**
 * P6-E05-S05 (Story 35.5) — Expenses module. The FOUNDATION the consolidated P&L
 * (Story 35.1) consumes via {@link expensesByUnitInPeriod}.
 *
 * An expense is money the business SPENT on a calendar date, attributed to a
 * business unit OR left null for SHARED OVERHEAD. The business-unit taxonomy is a
 * SUPERSET of the service-unit set ({@link SERVICE_UNITS}) plus `shop` (retail) —
 * expenses accrue to the retail unit too. NULL = shared overhead, which the P&L
 * buckets separately so it can be allocated/shown apart from any single unit.
 */

/** The business-unit codes an expense may be attributed to (AC1). Superset of
 * the service units + `shop`. NULL (shared overhead) is NOT in this list — a
 * null unit is a distinct, allowed state, not one of these codes. Mirrors the
 * `business_unit` CHECK in migration 0104 + `EXPENSE_BUSINESS_UNITS` in contracts. */
export const EXPENSE_BUSINESS_UNITS = [...SERVICE_UNITS, "shop"] as const;
export type ExpenseBusinessUnit = (typeof EXPENSE_BUSINESS_UNITS)[number];

/** True when `value` is one of the allowed (non-null) business-unit codes. */
export function isExpenseBusinessUnit(value: unknown): value is ExpenseBusinessUnit {
  return typeof value === "string" && (EXPENSE_BUSINESS_UNITS as readonly string[]).includes(value);
}

/** Raised when an expense / template input fails a domain rule (AC1/AC2/AC3). */
export class ExpenseValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "ExpenseValidationError";
  }
}

/** Validate a unit value: null (overhead) is allowed; otherwise must be a known code. */
function assertUnit(unit: ExpenseBusinessUnit | null): void {
  if (unit !== null && !isExpenseBusinessUnit(unit)) {
    throw new ExpenseValidationError("businessUnit", `Unknown business unit: ${String(unit)}`);
  }
}

/** Validate a strictly-positive integer-cents amount. */
function assertAmount(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ExpenseValidationError("amountCents", "Amount must be a positive integer (cents)");
  }
}

/** Validate a non-empty (after trim) category. Returns the trimmed value. */
function assertCategory(category: string): string {
  const trimmed = category.trim();
  if (trimmed.length === 0) {
    throw new ExpenseValidationError("category", "Category cannot be empty");
  }
  return trimmed;
}

/** Validate a non-empty payment method. Returns the trimmed value. */
function assertPaymentMethod(paymentMethod: string): string {
  const trimmed = paymentMethod.trim();
  if (trimmed.length === 0) {
    throw new ExpenseValidationError("paymentMethod", "Payment method cannot be empty");
  }
  return trimmed;
}

/** Validate a 1..28 day-of-month (valid in every calendar month). */
function assertDayOfMonth(dayOfMonth: number): void {
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
    throw new ExpenseValidationError("dayOfMonth", "day_of_month must be an integer 1..28");
  }
}

/* -------------------------------------------------------------- expenses CRUD */

export interface CreateExpenseInput {
  /** Calendar date the expense was incurred (YYYY-MM-DD). */
  expenseDate: string;
  category: string;
  /** Business unit, or null for shared overhead. */
  businessUnit: ExpenseBusinessUnit | null;
  amountCents: number;
  paymentMethod: string;
  reference?: string | null;
  receiptAttachmentUrl?: string | null;
  /** Recorded against a recurring template (set by the job); null for one-off. */
  recurringTemplateId?: string | null;
  /** The acting user (FK to users). */
  createdBy: string;
}

/** Create an expense (AC1/AC2). Validates amount > 0, non-empty category, known unit. */
export async function createExpense(db: Executor, input: CreateExpenseInput): Promise<ExpenseRow> {
  const category = assertCategory(input.category);
  const paymentMethod = assertPaymentMethod(input.paymentMethod);
  assertAmount(input.amountCents);
  assertUnit(input.businessUnit);

  const [row] = await db
    .insert(expenses)
    .values({
      expenseDate: input.expenseDate,
      category,
      businessUnit: input.businessUnit,
      amountCents: input.amountCents,
      paymentMethod,
      reference: input.reference ?? null,
      receiptAttachmentUrl: input.receiptAttachmentUrl ?? null,
      recurringTemplateId: input.recurringTemplateId ?? null,
      createdBy: input.createdBy,
    })
    .returning();
  return row!;
}

export interface UpdateExpenseInput {
  expenseDate?: string;
  category?: string;
  businessUnit?: ExpenseBusinessUnit | null;
  amountCents?: number;
  paymentMethod?: string;
  reference?: string | null;
  receiptAttachmentUrl?: string | null;
}

/** Update an expense (AC2). Partial patch; revalidates only the supplied fields.
 * Returns the updated row, or null when the id is unknown. */
export async function updateExpense(
  db: Executor,
  id: string,
  patch: UpdateExpenseInput,
): Promise<ExpenseRow | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.expenseDate !== undefined) set.expenseDate = patch.expenseDate;
  if (patch.category !== undefined) set.category = assertCategory(patch.category);
  if (patch.businessUnit !== undefined) {
    assertUnit(patch.businessUnit);
    set.businessUnit = patch.businessUnit;
  }
  if (patch.amountCents !== undefined) {
    assertAmount(patch.amountCents);
    set.amountCents = patch.amountCents;
  }
  if (patch.paymentMethod !== undefined) set.paymentMethod = assertPaymentMethod(patch.paymentMethod);
  if (patch.reference !== undefined) set.reference = patch.reference;
  if (patch.receiptAttachmentUrl !== undefined) set.receiptAttachmentUrl = patch.receiptAttachmentUrl;

  const [row] = await db.update(expenses).set(set).where(eq(expenses.id, id)).returning();
  return row ?? null;
}

/** Hard-delete an expense (AC2). Returns true when a row was removed. */
export async function deleteExpense(db: Executor, id: string): Promise<boolean> {
  const rows = await db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
  return rows.length > 0;
}

export interface ListExpensesOpts {
  /** Inclusive range start (YYYY-MM-DD). */
  from: string;
  /** EXCLUSIVE range end (YYYY-MM-DD) — half-open [from, to). */
  to: string;
  /**
   * Optional unit filter. A unit code restricts to that unit; `null` restricts to
   * SHARED OVERHEAD (null-unit) rows; omitted returns all units + overhead.
   */
  unit?: ExpenseBusinessUnit | null;
}

/** List expenses in a half-open [from, to) period, optionally filtered by unit
 * (or by shared overhead when `unit: null`). Newest expense_date first. */
export async function listExpenses(db: Executor, opts: ListExpensesOpts): Promise<ExpenseRow[]> {
  const dateRange = and(gte(expenses.expenseDate, opts.from), lt(expenses.expenseDate, opts.to));
  let where = dateRange;
  if (opts.unit === null) {
    where = and(dateRange, isNull(expenses.businessUnit));
  } else if (opts.unit !== undefined) {
    where = and(dateRange, eq(expenses.businessUnit, opts.unit));
  }
  return db
    .select()
    .from(expenses)
    .where(where)
    .orderBy(asc(expenses.expenseDate));
}

/* ------------------------------------------------------- recurring templates */

export interface CreateRecurringTemplateInput {
  category: string;
  businessUnit: ExpenseBusinessUnit | null;
  amountCents: number;
  paymentMethod: string;
  /** Calendar day-of-month the expense materialises on (1..28). */
  dayOfMonth: number;
  reference?: string | null;
  /** Defaults true. */
  active?: boolean;
  createdBy: string;
}

/** Create a recurring expense template (AC3). Validates amount/category/unit/day. */
export async function createRecurringTemplate(
  db: Executor,
  input: CreateRecurringTemplateInput,
): Promise<ExpenseRecurringTemplateRow> {
  const category = assertCategory(input.category);
  const paymentMethod = assertPaymentMethod(input.paymentMethod);
  assertAmount(input.amountCents);
  assertUnit(input.businessUnit);
  assertDayOfMonth(input.dayOfMonth);

  const [row] = await db
    .insert(expenseRecurringTemplates)
    .values({
      category,
      businessUnit: input.businessUnit,
      amountCents: input.amountCents,
      paymentMethod,
      dayOfMonth: input.dayOfMonth,
      reference: input.reference ?? null,
      active: input.active ?? true,
      createdBy: input.createdBy,
    })
    .returning();
  return row!;
}

export interface UpdateRecurringTemplateInput {
  category?: string;
  businessUnit?: ExpenseBusinessUnit | null;
  amountCents?: number;
  paymentMethod?: string;
  dayOfMonth?: number;
  reference?: string | null;
  active?: boolean;
}

/** Update a recurring template (AC2/AC3). Partial patch; revalidates supplied
 * fields. Returns the updated row, or null when the id is unknown. */
export async function updateRecurringTemplate(
  db: Executor,
  id: string,
  patch: UpdateRecurringTemplateInput,
): Promise<ExpenseRecurringTemplateRow | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.category !== undefined) set.category = assertCategory(patch.category);
  if (patch.businessUnit !== undefined) {
    assertUnit(patch.businessUnit);
    set.businessUnit = patch.businessUnit;
  }
  if (patch.amountCents !== undefined) {
    assertAmount(patch.amountCents);
    set.amountCents = patch.amountCents;
  }
  if (patch.paymentMethod !== undefined) set.paymentMethod = assertPaymentMethod(patch.paymentMethod);
  if (patch.dayOfMonth !== undefined) {
    assertDayOfMonth(patch.dayOfMonth);
    set.dayOfMonth = patch.dayOfMonth;
  }
  if (patch.reference !== undefined) set.reference = patch.reference;
  if (patch.active !== undefined) set.active = patch.active;

  const [row] = await db
    .update(expenseRecurringTemplates)
    .set(set)
    .where(eq(expenseRecurringTemplates.id, id))
    .returning();
  return row ?? null;
}

/** List recurring templates, newest first. */
export async function listRecurringTemplates(
  db: Executor,
): Promise<ExpenseRecurringTemplateRow[]> {
  return db
    .select()
    .from(expenseRecurringTemplates)
    .orderBy(asc(expenseRecurringTemplates.createdAt));
}

/* --------------------------------------------------------- materialise (AC3) */

/** The `YYYY-MM` month and `DD` day-of-month for an `asOfDate` (YYYY-MM-DD). */
function monthAndDay(asOfDate: string): { month: string; day: number } {
  const [y, m, d] = asOfDate.split("-");
  return { month: `${y}-${m}`, day: Number(d) };
}

export interface MaterialiseResult {
  /** How many concrete expenses were created on this run. */
  created: number;
}

/**
 * Materialise every DUE recurring template into a concrete expense on `asOfDate`
 * (AC3). A template is due when it is `active`, its `dayOfMonth` matches the day
 * of `asOfDate`, and it has NOT already run this calendar month
 * (`lastRunMonth != YYYY-MM`). IDEMPOTENT: a second run the same month re-finds
 * `lastRunMonth` set and skips. Each materialised expense carries
 * `recurringTemplateId` back to its template and uses `asOfDate` as its
 * `expense_date`. Runs in a transaction per template so the insert + the
 * `last_run_month` stamp are atomic.
 *
 * `asOfDate` is the YYYY-MM-DD the daily cron passes (today). Returns the count
 * created so the job can log a per-run summary.
 */
export async function materialiseDueRecurringExpenses(
  db: Executor,
  asOfDate: string,
): Promise<MaterialiseResult> {
  const { month, day } = monthAndDay(asOfDate);

  const due = await db
    .select()
    .from(expenseRecurringTemplates)
    .where(
      and(
        eq(expenseRecurringTemplates.active, true),
        eq(expenseRecurringTemplates.dayOfMonth, day),
      ),
    );

  let created = 0;
  for (const tpl of due) {
    // Idempotency guard: already materialised this calendar month → skip.
    if (tpl.lastRunMonth === month) continue;

    await db.insert(expenses).values({
      expenseDate: asOfDate,
      category: tpl.category,
      businessUnit: tpl.businessUnit,
      amountCents: tpl.amountCents,
      paymentMethod: tpl.paymentMethod,
      reference: tpl.reference,
      recurringTemplateId: tpl.id,
      createdBy: tpl.createdBy,
    });
    await db
      .update(expenseRecurringTemplates)
      .set({ lastRunMonth: month, updatedAt: new Date() })
      .where(eq(expenseRecurringTemplates.id, tpl.id));
    created += 1;
  }

  return { created };
}

/* ---------------------------------------- expensesByUnitInPeriod (AC4 — P&L) */

/**
 * The P&L expense read model (AC4). For a half-open `[from, to)` period (both
 * YYYY-MM-DD), the per-unit expense totals (keyed by unit code), a separate
 * SHARED-OVERHEAD bucket (the null-unit rows), and the grand total — all in
 * integer cents. The consolidated P&L (Story 35.1) subtracts `perUnit[unit]` from
 * each unit's revenue and shows `sharedOverheadCents` as an unallocated line.
 *
 * `perUnit` carries ONLY units that actually have expenses in the period (absent
 * = zero), so the consumer can iterate its own unit list and default to 0.
 * `totalCents` === sum(perUnit) + sharedOverheadCents.
 */
export interface ExpensesByUnit {
  /** unit code → total expense cents in the period (present units only). */
  perUnit: Partial<Record<ExpenseBusinessUnit, number>>;
  /** Total cents of NULL-unit (shared overhead) expenses in the period. */
  sharedOverheadCents: number;
  /** Grand total cents = sum(perUnit) + sharedOverheadCents. */
  totalCents: number;
}

export async function expensesByUnitInPeriod(
  db: Executor,
  from: string,
  to: string,
): Promise<ExpensesByUnit> {
  const rows = await db
    .select({ businessUnit: expenses.businessUnit, amountCents: expenses.amountCents })
    .from(expenses)
    .where(and(gte(expenses.expenseDate, from), lt(expenses.expenseDate, to)));

  const perUnit: Partial<Record<ExpenseBusinessUnit, number>> = {};
  let sharedOverheadCents = 0;
  let totalCents = 0;

  for (const r of rows) {
    totalCents += r.amountCents;
    if (r.businessUnit === null) {
      sharedOverheadCents += r.amountCents;
    } else if (isExpenseBusinessUnit(r.businessUnit)) {
      perUnit[r.businessUnit] = (perUnit[r.businessUnit] ?? 0) + r.amountCents;
    } else {
      // Defensive: an unknown code (should be impossible via the CHECK) is bucketed
      // as overhead rather than silently dropped so totals always reconcile.
      sharedOverheadCents += r.amountCents;
    }
  }

  return { perUnit, sharedOverheadCents, totalCents };
}
