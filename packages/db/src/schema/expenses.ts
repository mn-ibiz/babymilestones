import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

/**
 * `expense_recurring_templates` (P6-E05-S05 / Story 35.5 AC3) — a recurring
 * expense (rent, salaries) configured ONCE; a daily scheduled job materialises a
 * concrete {@link expenses} row on its `dayOfMonth`, IDEMPOTENTLY at most once per
 * template per calendar month (guarded by {@link lastRunMonth}).
 *
 * `businessUnit` is nullable = SHARED OVERHEAD (not owned by any single unit).
 * Amounts are integer cents. `dayOfMonth` is constrained to 1..28 so the schedule
 * is valid in every month (Feb has no 29/30/31) and never silently skips.
 */
export const expenseRecurringTemplates = pgTable(
  "expense_recurring_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Free-text expense category, non-empty (e.g. "Rent", "Salaries"). */
    category: text("category").notNull(),
    /** The business unit, or NULL for shared overhead. One of EXPENSE_BUSINESS_UNITS. */
    businessUnit: text("business_unit"),
    /** The recurring amount in integer cents. Strictly positive (DB CHECK). */
    amountCents: integer("amount_cents").notNull(),
    /** How the expense is paid (e.g. "cash", "bank_transfer", "mpesa"). */
    paymentMethod: text("payment_method").notNull(),
    /** Calendar day-of-month the expense materialises on. 1..28 (DB CHECK). */
    dayOfMonth: integer("day_of_month").notNull(),
    /** Optional external reference / memo. */
    reference: text("reference"),
    /** Whether the template is live; inactive templates are skipped by the job. */
    active: boolean("active").notNull().default(true),
    /** Last YYYY-MM the job materialised from this template — the idempotency guard. */
    lastRunMonth: text("last_run_month"),
    /** The admin/accountant who created the template (FK to users). */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    activeDayIdx: index("expense_recurring_templates_active_day_idx").on(
      t.active,
      t.dayOfMonth,
    ),
  }),
);

export type ExpenseRecurringTemplateRow = typeof expenseRecurringTemplates.$inferSelect;
export type ExpenseRecurringTemplateInsert = typeof expenseRecurringTemplates.$inferInsert;

/**
 * `expenses` (P6-E05-S05 / Story 35.5 AC1) — money the business SPENT on a
 * calendar date, attributed to a {@link businessUnit} (the service-unit taxonomy +
 * `shop`) OR NULL for SHARED OVERHEAD. Expenses subtract from unit revenue in the
 * consolidated P&L (Story 35.1) via the `expensesByUnitInPeriod(from,to)` read
 * model. A row materialised from a recurring template carries
 * {@link recurringTemplateId} back to it; one-off rows leave it NULL.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The calendar date the expense was incurred (YYYY-MM-DD). The P&L buckets on this. */
    expenseDate: date("expense_date").notNull(),
    /** Free-text expense category, non-empty. */
    category: text("category").notNull(),
    /** The business unit, or NULL for shared overhead. One of EXPENSE_BUSINESS_UNITS. */
    businessUnit: text("business_unit"),
    /** The amount in integer cents. Strictly positive (DB CHECK). */
    amountCents: integer("amount_cents").notNull(),
    /** How the expense was paid. */
    paymentMethod: text("payment_method").notNull(),
    /** Optional external reference / memo. */
    reference: text("reference"),
    /** Optional URL to a receipt scan stored elsewhere (no upload infra). */
    receiptAttachmentUrl: text("receipt_attachment_url"),
    /** When materialised from a recurring template, the template it came from. */
    recurringTemplateId: uuid("recurring_template_id").references(
      () => expenseRecurringTemplates.id,
    ),
    /** The admin/accountant who recorded the expense (FK to users). */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    dateIdx: index("expenses_date_idx").on(t.expenseDate),
    unitDateIdx: index("expenses_unit_date_idx").on(t.businessUnit, t.expenseDate),
    recurringTemplateIdx: index("expenses_recurring_template_idx").on(
      t.recurringTemplateId,
    ),
  }),
);

export type ExpenseRow = typeof expenses.$inferSelect;
export type ExpenseInsert = typeof expenses.$inferInsert;
